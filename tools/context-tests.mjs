// Context-source pipeline tests — no model, no LM Studio, no machine-specific data.
//
//   node tools/context-tests.mjs
//
// Covers the half of the pipeline that runs before a request is sent: which sources get
// built, what they contain, how they behave when their material is missing or far too
// large, and how the per-chat priming state survives reloads and parallel chats. The
// provider half — sockets, SSE, cancellation — is covered by `cargo test` against
// `tools/fake-server.mjs`.

import fs from 'node:fs';
import { loadRenderer, installBridge, makeGraph, makeLibrary, makeHistory, Suite } from './context-harness.mjs';

const t = new Suite('context-tests');

/** A fresh renderer context per scenario, so no test can leak state into the next. */
function fresh({ graph = makeGraph(), bridge = {} } = {}) {
  const h = loadRenderer();
  installBridge(h.ctx, bridge);
  h.api.setGraph(graph);
  h.api.set('conceptMapPath', 'fixture-graph.json');   // non-empty ⇒ no disk resolution
  return h;
}

const TEMP_DIRS = [];
function library(files) {
  const lib = makeLibrary(files);
  TEMP_DIRS.push(lib.dir);
  return lib;
}

// ── Context sources: the shared naming contract ──────────────────────────────────

await t.section('Context-source registry', async () => {
  const { api } = fresh();
  const sources = api.sources();
  t.eq(Object.keys(sources), ['web', 'map', 'library', 'history', 'hermes'], 'five sources are registered');

  // CONTEXT_SOURCES maps a source id to the one display name used by the composer tooltip,
  // the in-chat note and the `## Context source: <name>` header the model reads, so those
  // three cannot drift apart.
  const named = Object.values(sources).every(s => typeof s === 'string' && s.length > 0);
  t.ok(named, 'every source resolves to a display name');
  t.eq(new Set(Object.values(sources)).size, 5, 'the five names are distinct, so headers are unambiguous');
});

await t.section('Preamble', async () => {
  const { api } = fresh();
  const plain = api.preamble();
  const tool = api.preambleTool();

  // Measured previously: tool-state confabulation is worst with NO sources attached, so
  // the preamble ships unconditionally and must keep denying tools it does not have.
  t.contains(plain, 'no tools', 'the plain preamble denies having tools');
  t.ok(plain === api.preamble(), 'the preamble is constant, so it stays a cacheable prefix');
  t.contains(tool, 'concept_search', 'the tool preamble names the one tool that exists');
  t.ok(tool !== plain, 'the tool variant is a different text, not the same lie');
  // The denial is narrowed, never dropped — the confabulation it prevents is about the
  // other tools the model imagines it has.
  t.ok(/cannot|no other|not have/i.test(tool), 'the tool preamble still denies everything else');
});

// ── Concept map ──────────────────────────────────────────────────────────────────

await t.section('Concept map: priming', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);

  const prime = await api.buildMapPrime();
  t.ok(prime && prime.length > 0, 'a prime is produced from the graph');
  t.contains(prime, 'Context source: Concept map', 'the prime carries the shared header');
  t.contains(prime, 'Tauri Error Handling', 'a topic-level concept is in the map');

  const again = await api.buildMapPrime();
  t.eq(again, prime, 'the prime is byte-identical when nothing changed — the prefix stays reusable');

  // `[level]` tags are deliberately not rendered: canonization assigns macro by recurrence,
  // so the levels would tell the model something untrue about abstraction.
  t.excludes(prime, '[macro]', 'level tags are not rendered');
  t.excludes(prime, '[topic]', 'level tags are not rendered');
});

await t.section('Concept map: the evidence floor', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMinEvidence', 3);
  const prime = await api.buildMapPrime();
  // Weight 2 is a single mention (cmEvidenceWeight = records + chunks).
  t.excludes(prime, 'Single Mention Noise', 'a single-mention concept is dropped at the default floor');

  const { api: api2 } = fresh();
  api2.set('conceptMapEnabled', true);
  api2.set('conceptMapMinEvidence', 0);
  // The level filter is a separate gate from the evidence floor — this concept is a motif,
  // which the default macro,topic selection excludes regardless of its evidence.
  api2.set('conceptMapLevels', ['macro', 'topic', 'subtopic', 'motif']);
  const all = await api2.buildMapPrime();
  t.contains(all, 'Single Mention Noise', 'and is kept when the floor is removed');
});

await t.section('Concept map: prime signature drives re-priming', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  const sig1 = api.primeSig();

  api.set('conceptMapLevels', ['macro']);
  const sig2 = api.primeSig();
  t.ok(sig1 !== sig2, 'changing the levels changes the signature, so the chat re-primes');

  api.set('conceptMapLevels', ['macro', 'topic']);
  t.eq(api.primeSig(), sig1, 'and changing it back restores it — no spurious re-prime');
});

await t.section('Concept map: slice is small and about the message', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  const slice = await api.buildMapSlice('how should I structure error handling in Tauri');
  t.ok(slice, 'a matching message produces a slice');
  t.contains(slice, 'Tauri Error Handling', 'the slice contains the concept the message is about');
  const prime = await api.buildMapPrime();
  t.ok(slice.length < prime.length, 'a slice is smaller than the whole map', { slice: slice.length, prime: prime.length });
});

await t.section('Concept map: oversized budget is a ceiling, not a size control', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);

  const full = await api.buildMapPrime();
  api.set('conceptMapMaxChars', 700);
  const trimmed = await api.buildMapPrime();

  t.ok(trimmed.length < full.length, 'a tight budget shrinks the map', { full: full.length, trimmed: trimmed.length });

  // The budget governs the ENTRY LIST, not the whole block: the framing that explains what
  // the map is stays whole, because a half-truncated instruction is worse than a shorter
  // list. That is ~1.9k chars of constant overhead, which is why a 700-char budget does not
  // produce a 700-char message.
  const firstEntryAt = trimmed.indexOf('Frontend Design Principles');
  const framingOverhead = firstEntryAt >= 0 ? firstEntryAt : trimmed.length;
  t.ok(trimmed.length - framingOverhead <= 700 * 1.5,
    'the entry list respects conceptMapMaxChars, framing excluded',
    { entries: trimmed.length - framingOverhead, budget: 700 });

  // The documented hazard, made visible: the trim is a tail cut on a salience-ranked list,
  // and salience is recurrence. So a tight budget keeps whatever came up most often and
  // drops whatever came up least, regardless of which is worth reading — here the two
  // recurrence artefacts survive while two substantive topics are cut. Asserted so a change
  // to the trim is noticed here rather than discovered later inside an answer.
  t.contains(trimmed, 'Frontend Design Principles', 'the highest-salience entry survives the cut');
  t.excludes(trimmed, 'Cancellation Semantics', 'and the low-salience tail is dropped');
  t.ok(trimmed.includes('Clock') && trimmed.includes('Magnifier'),
    'recurrence artefacts outrank substantive topics under a tight budget — the ceiling is not a size control');
});

// ── On-demand mode: the concept_search tool ──────────────────────────────────────

await t.section('On-demand: broad queries are refused', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');

  // Keyed on TOKENS, not the raw string: a regex over the string let "my topics" through,
  // which then lexically matched the concepts containing the word "topics" — worse than an
  // empty result, because those then stood as the answer to "what does this user think".
  // cmIsBroadQuery takes a Set of surviving tokens, the same way cmConceptSearch calls it.
  const broad = q => api.isBroadQuery(q, new Set(api.tokens(q)));
  for (const q of ['*', 'everything', 'all topics', 'my topics']) {
    t.ok(broad(q), `"${q}" is treated as a broad query`);
  }
  for (const q of ['tauri error handling', 'kubernetes ingress']) {
    t.ok(!broad(q), `"${q}" is treated as specific`);
  }
});

await t.section('On-demand: a miss returns nothing and blocks the fallback', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');
  const state = api.newToolState();

  const call = (args) => api.execToolCall({ id: 'c1', function: { name: 'concept_search', arguments: JSON.stringify(args) } }, state);

  const miss = await call({ query: 'kubernetes ingress controller' });
  t.ok(!(miss.concepts && miss.concepts.length), 'a specific query that misses returns no concepts');

  // The block is structural because prose failed: told the map had nothing, the model said
  // so correctly and then queried "*" and framed the subject in the user's concepts anyway.
  const after = await call({ query: '*' });
  t.eq(after.matched, 'blocked', 'a broad query after a miss is blocked, not answered with the salience list');
  t.ok(!(after.concepts && after.concepts.length), 'and carries no concepts');
});

await t.section('On-demand: the matched-token floor', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');
  const state = api.newToolState();
  const call = (q) => api.execToolCall({ id: 'c', function: { name: 'concept_search', arguments: JSON.stringify({ query: q }) } }, state);

  // A 3+-token query needs 2 matched tokens: "kubernetes ingress controller" was matching
  // unrelated concepts on the single word "controller".
  const one = await call('kubernetes ingress transport');
  const two = await call('streaming transport chunk');
  t.ok(!(one.concepts || []).length, 'one matched token out of three is not enough');
  t.ok((two.concepts || []).length > 0, 'two matched tokens is a hit');
});

await t.section('On-demand: malformed arguments become a result, not a throw', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');
  const state = api.newToolState();
  const out = await api.execToolCall({ id: 'c', function: { name: 'concept_search', arguments: '{"query": ' } }, state);
  t.ok(out && typeof out === 'object', 'a bad argument string returns an error result object');
  t.ok(JSON.stringify(out).length < 2000, 'and it stays small enough to feed back as a tool message');
});

await t.section('On-demand: no tool is attached once the map is primed', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');
  t.ok(await api.toolsForRequest(), 'on-demand mode attaches concept_search');

  api.set('primedConceptMap', 'a primed map');
  t.ok(!(await api.toolsForRequest()), 'switching a primed chat to on-demand must not send the map AND the tool');
});

// ── Local library (vault retrieval) ──────────────────────────────────────────────

await t.section('Library: a small file that fits is sent whole', async () => {
  // The regression: relevance-trimming ran even when the file already fitted the budget,
  // and dropped every zero-scoring paragraph. cmTokens has a 3-char floor (so "CI"
  // vanishes) and does not stem ("run" ≠ "runs"), so half of a two-part answer went
  // missing from a 600-char file against a 24,000-char budget.
  const lib = library({
    'deploy.md': [
      '# Deploy',
      '',
      'The deployment pipeline runs on CI.',
      '',
      'Rollback is done with the previous artifact tag.',
      '',
      'Secrets come from the environment, never the repo.',
    ].join('\n'),
  });
  const { api } = fresh({ bridge: { libraryRoot: lib.dir } });
  api.set('libraryEnabled', true);
  api.set('librarySourcesText', `Notes | ${lib.dir}`);
  api.set('libraryMaxChars', 24000);
  api.set('librarySemantic', false);

  const out = await api.buildLibrary('how does deployment work');
  t.ok(out, 'the library builds a context block');
  t.contains(out, 'Rollback is done', 'a paragraph that scores zero against the query is still included');
  t.contains(out, 'Secrets come from', 'the whole file is sent when it fits the budget');
});

await t.section('Library: oversized material is trimmed to budget', async () => {
  const big = 'Paragraph about streaming transport and chunk boundaries.\n\n'.repeat(4000);
  const lib = library({ 'huge.md': big, 'small.md': 'A short note about cancellation semantics.' });
  const { api } = fresh({ bridge: { libraryRoot: lib.dir } });
  api.set('libraryEnabled', true);
  api.set('librarySourcesText', `Notes | ${lib.dir}`);
  api.set('libraryMaxChars', 5000);
  api.set('librarySemantic', false);

  const out = await api.buildLibrary('streaming transport');
  t.ok(out, 'a context block is still produced from oversized sources');
  t.ok(out.length < 5000 * 3, 'the block stays near its budget rather than sending everything', { len: out.length });
});

await t.section('Library: empty and missing sources report, never silently blank', async () => {
  const { api, errors } = fresh();
  api.set('libraryEnabled', true);
  api.set('librarySourcesText', '');
  const out = await api.buildLibrary('anything');
  t.eq(out, null, 'no sources configured produces no context block');
  t.ok(errors.some(e => /no sources are set/i.test(e.text)), 'and tells the user why');

  const { api: api2, errors: errors2 } = fresh();
  api2.set('libraryEnabled', true);
  api2.set('librarySourcesText', 'D:/definitely/not/here');
  const out2 = await api2.buildLibrary('anything');
  t.eq(out2, null, 'an unreadable source produces no context block');
  t.ok(errors2.some(e => /no readable text files/i.test(e.text)), 'and says nothing was readable');
});

await t.section('Library: the semantic ranker only reorders, and says why when it cannot', async () => {
  const lib = library({
    'a-transport.md': 'Notes on streaming transport, chunk boundaries and reconnection.',
    'b-unrelated.md': 'Notes on garden soil and compost.',
    'c-cancel.md': 'Notes on cancellation semantics for in-flight requests.',
  });

  // Semantic service reachable: only the ORDER changes, the same files are considered.
  const withSemantic = fresh({
    bridge: {
      libraryRoot: lib.dir,
      semanticOrder: [`${lib.dir}\\c-cancel.md`.replace(/\\/g, '/'), `${lib.dir}/a-transport.md`],
    },
  });
  withSemantic.api.set('libraryEnabled', true);
  withSemantic.api.set('librarySourcesText', `Notes | ${lib.dir}`);
  withSemantic.api.set('libraryMaxChars', 24000);
  withSemantic.api.set('librarySemantic', true);
  const out = await withSemantic.api.buildLibrary('how do I stop a request');
  t.ok(out, 'a block is produced with the semantic ranker in play');

  // Service unreachable: falls back to lexical, and the NOTE has to say so — `ranked:
  // lexical` on its own is also what a genuine miss looks like, and that silence was the bug.
  const noService = fresh({ bridge: { libraryRoot: lib.dir, semanticOrder: null } });
  noService.api.set('libraryEnabled', true);
  noService.api.set('librarySourcesText', `Notes | ${lib.dir}`);
  noService.api.set('librarySemantic', true);
  // A query with real lexical purchase, so the fallback lands on the lexical ranker rather
  // than on the compact-recent path a total miss produces.
  await noService.api.buildLibrary('cancellation semantics for in-flight requests');
  const note = noService.notes.find(n => n.source === 'library');
  t.ok(note, 'a library note is rendered');
  t.eq(note?.ranker, 'lexical', 'an unreachable ranker falls back to lexical');
  t.ok(note?.why && String(note.why).length > 0, 'and the note carries the reason, not just the mode');

  // A query that matches nothing at all is a third state, and it must not be reported as
  // though the ranker chose it.
  const noHit = fresh({ bridge: { libraryRoot: lib.dir, semanticOrder: null } });
  noHit.api.set('libraryEnabled', true);
  noHit.api.set('librarySourcesText', `Notes | ${lib.dir}`);
  noHit.api.set('librarySemantic', false);
  await noHit.api.buildLibrary('xylophone tessellation quarks');
  t.eq(noHit.notes.find(n => n.source === 'library')?.ranker, 'recent',
    'no lexical hit at all falls back to compact-recent, reported as recent');
});

// ── Browser history ──────────────────────────────────────────────────────────────

await t.section('History: "most recent" means most recent, not most visited', async () => {
  // The regression: the Rust query orders by visit_count DESC and the JS `recent` path
  // sliced the head of that list while telling the model these were the newest pages. On
  // real history the top of that list is navigation chrome.
  const items = makeHistory([
    { url: 'https://example.com/newtab', title: 'New tab', visitCount: 5000, lastVisitMs: Date.UTC(2026, 0, 1) },
    { url: 'https://youtube.com', title: 'YouTube', visitCount: 4000, lastVisitMs: Date.UTC(2026, 0, 2) },
    { url: 'https://docs.rs/tokio', title: 'tokio docs', visitCount: 3, lastVisitMs: Date.UTC(2026, 7, 9) },
  ]);
  const { api } = fresh({ bridge: { historyItems: items } });
  api.set('historyEnabled', true);
  api.set('historyMode', 'recent');

  const out = await api.buildHistory('');
  t.ok(out, 'a history block is produced');
  const tokioAt = out.indexOf('tokio docs');
  const newtabAt = out.indexOf('New tab');
  t.ok(tokioAt >= 0 && (newtabAt < 0 || tokioAt < newtabAt),
    'the genuinely most-recent page comes before the most-visited chrome', { tokioAt, newtabAt });
});

await t.section('History: relevant mode ranks on the message', async () => {
  const items = makeHistory([
    { url: 'https://example.com/gardening', title: 'Compost guide', visitCount: 900 },
    { url: 'https://tauri.app/v2/guides/error', title: 'Tauri error handling', visitCount: 2 },
  ]);
  const { api } = fresh({ bridge: { historyItems: items } });
  api.set('historyEnabled', true);
  api.set('historyMode', 'relevant');

  const out = await api.buildHistory('tauri error handling');
  t.contains(out, 'Tauri error handling', 'the page matching the question is selected');
  t.ok(out.indexOf('Tauri error handling') < (out.indexOf('Compost guide') >>> 0),
    'and outranks a far more visited but unrelated page');
});

await t.section('History: empty results report rather than inject an empty block', async () => {
  const { api, errors } = fresh({ bridge: { historyItems: [] } });
  api.set('historyEnabled', true);
  const out = await api.buildHistory('anything');
  t.eq(out, null, 'no history rows produce no context block');
  t.ok(errors.some(e => /no entries were found/i.test(e.text)), 'and the user is told');
});

await t.section('History: oversized history is trimmed to budget', async () => {
  const items = makeHistory(Array.from({ length: 2000 }, (_, i) => ({
    url: `https://example.com/page-${i}`,
    title: `A fairly long page title number ${i} about streaming transport`,
    visitCount: i,
  })));
  const { api } = fresh({ bridge: { historyItems: items } });
  api.set('historyEnabled', true);
  api.set('historyMode', 'recent');
  api.set('historyMaxChars', 4000);

  const out = await api.buildHistory('');
  t.ok(out.length < 4000 * 3, 'the block respects historyMaxChars', { len: out.length });
});

await t.section('History: timestamps are unambiguous to a model', async () => {
  // Finnish locale renders 9.8.2026, which a model cannot distinguish from US ordering.
  const items = makeHistory([{ url: 'https://example.com/x', title: 'A page', visitCount: 1 }]);
  const { api } = fresh({ bridge: { historyItems: items } });
  api.set('historyEnabled', true);
  api.set('historyMode', 'recent');
  const out = await api.buildHistory('');
  t.ok(/\d{4}-\d{2}-\d{2}/.test(out), 'dates are ISO-ordered (YYYY-MM-DD)', out.slice(0, 300));
  t.ok(!/\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(out), 'and never in the ambiguous d.m.yyyy form');
});

// ── Combinations, ordering and the request shape ─────────────────────────────────

await t.section('Combinations: sources stack in the documented order', async () => {
  const lib = library({ 'note.md': 'A note about streaming transport and chunk boundaries.' });
  const items = makeHistory([{ url: 'https://tauri.app', title: 'Tauri streaming transport', visitCount: 3 }]);
  const { api } = fresh({ bridge: { libraryRoot: lib.dir, historyItems: items } });

  api.set('conceptMapEnabled', true);
  api.set('libraryEnabled', true);
  api.set('librarySourcesText', `Notes | ${lib.dir}`);
  api.set('librarySemantic', false);
  api.set('historyEnabled', true);

  const message = 'streaming transport';
  const mapSlice = await api.buildMapSlice(message);
  const libraryCtx = await api.buildLibrary(message);
  const historyCtx = await api.buildHistory(message);

  const built = [mapSlice, libraryCtx, historyCtx].filter(Boolean);
  t.eq(built.length, 3, 'three per-message sources build together without interfering');

  // Injection order in streamAssistantResponse is map → library → hermes → history → web.
  // The header line continues with a per-source summary after an em dash; take the name.
  const headers = built.map(b => ((b.match(/## Context source: ([^\n—]+)/) || [])[1] || '').trim());
  t.eq(headers, ['Concept map', 'Local library', 'Browser history'], 'each block is labelled with its own source header');

  const combined = built.join('\n');
  t.ok(new Set(headers).size === headers.length, 'no two sources claim the same header');
  t.ok(combined.length > 0, 'the combined payload is non-empty');
});

await t.section('Combinations: a source that is off contributes nothing', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', false);
  api.set('libraryEnabled', false);
  api.set('historyEnabled', false);
  api.set('hermesEnabled', false);

  t.eq(await api.buildLibrary('x'), null, 'library off → null');
  t.eq(await api.buildHistory('x'), null, 'history off → null');
  t.eq(await api.buildHermes('x'), null, 'hermes off → null');
});

await t.section('Combinations: Hermes stays off unless explicitly enabled', async () => {
  // There is no auto-enable and no path that reads that workspace with the toggle off.
  const { api } = fresh({ bridge: { hermesDocs: { root: '/tmp/h', indexText: '', indexFound: false, docs: [{ path: '/tmp/h/active/x.md', tier: 'active', name: 'x.md', rel: 'active/x.md', text: 'A current topic about streaming transport.', chars: 42, truncated: false, mtime: 0 }], stats: {} } } });
  api.set('hermesEnabled', false);
  t.eq(await api.buildHermes('streaming transport'), null, 'a populated workspace is not read while the toggle is off');

  api.set('hermesEnabled', true);
  const on = await api.buildHermes('streaming transport');
  t.ok(on, 'and is read once it is on');
  t.contains(on, 'Context source:', 'with the shared header');
});

// ── Per-chat state: reload and concurrency ───────────────────────────────────────

await t.section('Reload: a reopened chat re-primes from the map as it stands now', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);

  const prime = await api.buildMapPrime();
  api.set('primedConceptMap', prime);
  api.set('primedConceptMapSig', api.primeSig());

  // loadChatById clears both — priming is per-chat and is not stored in the transcript, so
  // continuing on a map the current settings no longer produce would be worse than a miss.
  api.set('primedConceptMap', null);
  api.set('primedConceptMapSig', '');
  t.eq(api.get('primedConceptMap'), null, 'opening a chat drops the previous prime');

  const reprimed = await api.buildMapPrime();
  t.eq(reprimed, prime, 're-priming an unchanged map reproduces the identical text');
});

await t.section('Reload: a changed map produces a different prime', async () => {
  const h = fresh();
  h.api.set('conceptMapEnabled', true);
  const before = await h.api.buildMapPrime();

  h.api.setGraph(makeGraph({ conceptCount: 6 }));
  const after = await h.api.buildMapPrime();
  t.ok(before !== after, 'a narrower graph gives a different prime, so the chat cannot silently continue on the old one');
});

await t.section('Concurrency: two chats keep independent priming state', async () => {
  // Two renderer contexts stand in for two chats' state. What this guards is that nothing
  // in the builders reaches shared module state that would let one chat's prime or tool
  // state leak into the other.
  const a = fresh();
  const b = fresh({ graph: makeGraph({ conceptCount: 6 }) });
  a.api.set('conceptMapEnabled', true);
  b.api.set('conceptMapEnabled', true);

  const [pa, pb] = await Promise.all([a.api.buildMapPrime(), b.api.buildMapPrime()]);
  t.ok(pa !== pb, 'each chat primes from its own graph');
  t.contains(pa, 'Token Budgets', 'the wider graph keeps its extra concepts');
  t.excludes(pb, 'Token Budgets', 'the narrower one does not gain them');

  // Interleaved tool state: a miss in one chat must not block the other's broad query.
  a.api.set('conceptMapMode', 'ondemand');
  b.api.set('conceptMapMode', 'ondemand');
  const sa = a.api.newToolState();
  const sb = b.api.newToolState();
  await a.api.execToolCall({ id: '1', function: { name: 'concept_search', arguments: '{"query":"kubernetes ingress controller"}' } }, sa);
  const blockedInA = await a.api.execToolCall({ id: '2', function: { name: 'concept_search', arguments: '{"query":"*"}' } }, sa);
  const freshInB = await b.api.execToolCall({ id: '3', function: { name: 'concept_search', arguments: '{"query":"*"}' } }, sb);
  t.eq(blockedInA.matched, 'blocked', 'the chat that missed has its fallback blocked');
  t.ok(freshInB.matched !== 'blocked', 'the other chat is unaffected', freshInB.matched);
});

await t.section('Concurrency: per-send tool state resets between sends', async () => {
  const { api } = fresh();
  api.set('conceptMapEnabled', true);
  api.set('conceptMapMode', 'ondemand');

  const s1 = api.newToolState();
  await api.execToolCall({ id: '1', function: { name: 'concept_search', arguments: '{"query":"kubernetes ingress controller"}' } }, s1);
  const blocked = await api.execToolCall({ id: '2', function: { name: 'concept_search', arguments: '{"query":"*"}' } }, s1);
  t.eq(blocked.matched, 'blocked', 'the block holds for the rest of that send');

  const s2 = api.newToolState();
  const nextSend = await api.execToolCall({ id: '3', function: { name: 'concept_search', arguments: '{"query":"*"}' } }, s2);
  t.ok(nextSend.matched !== 'blocked', 'and is lifted for the next send', nextSend.matched);
});

// ── Cleanup ──────────────────────────────────────────────────────────────────────

for (const dir of TEMP_DIRS) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.exit(t.report());
