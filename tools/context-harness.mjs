// Loader for the context-source pipeline tests.
//
// Same trick as the older harness kept in the local information base: slice the real
// builder functions out of `renderer.js` into a `vm` context and stub only the DOM and the
// Tauri bridge, so the tests exercise production code rather than a reimplementation of it.
// What is different here is that everything it runs on is a FIXTURE — a synthetic concept
// graph, library files written into a temp directory, history rows built in memory. Nothing
// reads this machine, so the suite is deterministic, runs in CI or on a fresh checkout, and
// is safe to keep in a public repo.
//
// It reads renderer.js relative to this file, so it keeps working as the app changes — but
// a rename of any sliced function or section marker breaks the slice loudly, which is the
// intended failure mode.

import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'renderer.js');

/**
 * @param {object}  [opts]
 * @param {string}  [opts.extraStubs]  extra source appended after the standard stubs, for
 *                                     suites that drive DOM-bound code (see
 *                                     stream-state-tests.mjs) and must shim more of it.
 * @param {object}  [opts.extraGlobals] extra values placed in the vm context before the
 *                                     slices run — a document shim, timers, and so on.
 */
export function loadRenderer({ extraStubs = '', extraGlobals = {} } = {}) {
  const src = fs.readFileSync(SRC, 'utf8');
  const cut = (a, b) => {
    const i = src.indexOf(a);
    const j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) {
      throw new Error(`slice failed: ${JSON.stringify(a)} .. ${JSON.stringify(b)} — a marker or function was renamed in renderer.js`);
    }
    return src.slice(i, j);
  };

  // A: defaults, pref helpers, and all context-source state and framings.
  const stateBlock = cut('const DEFAULTS = {', 'let analysisDatasets = [];');
  // B: every context-source builder and its helpers (web → map → library → history → hermes).
  const fnBlock = cut('// ── Web search execution', '// ── Input handling');

  const store = new Map();
  const notes = [];
  const errors = [];

  const ctx = {
    console,
    performance,
    JSON,
    Math,
    Date,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    window: { api: {} },
    __notes: notes,
    __errors: errors,
    ...extraGlobals,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // Stubs come AFTER the slices so they replace the real DOM-bound implementations.
  const stubs = `
    addMessage = (kind, text) => { __errors.push({ kind, text }); };
    renderConceptMapNote = i => { __notes.push({ source: 'map', ...i }); };
    renderLibraryNote    = i => { __notes.push({ source: 'library', ...i }); };
    renderHistoryNote    = i => { __notes.push({ source: 'history', ...i }); };
    renderHermesNote     = i => { __notes.push({ source: 'hermes', ...i }); };
    renderWebSearchNote  = i => { __notes.push({ source: 'web', ...i }); };
    // The on-demand tool renders its own transcript note; without this stub every
    // concept_search comes back as "document is not defined" wrapped in an error result,
    // which reads exactly like a search that legitimately found nothing.
    renderConceptSearchNote = i => { __notes.push({ source: 'conceptSearch', ...i }); };
    loadConceptGraph = async () => globalThis.__GRAPH;
    updateContextBar = () => {};
    globalThis.API = {
      setGraph: g => { globalThis.__GRAPH = g; conceptGraphCache = { path: null, graph: null }; },
      // Direct eval so these reach the module's \`let\` bindings, which are lexical and are
      // NOT properties of globalThis — assigning via globalThis silently shadows them.
      set: (k, v) => { eval(k + ' = v'); },
      get: k => eval(k),
      call: (name, ...a) => eval(name)(...a),
      buildMapPrime: buildConceptMapPrime,
      buildMapSlice: buildConceptMapSlice,
      buildLibrary: buildLibraryContext,
      buildHistory: buildHistoryContext,
      buildHermes: buildHermesContext,
      formatSearch: formatSearchContext,
      execToolCall: cmExecuteToolCall,
      newToolState: cmNewToolState,
      toolsForRequest: cmToolsForRequest,
      isBroadQuery: cmIsBroadQuery,
      tokens: cmTokens,
      primeSig: () => cmPrimeSignature(),
      preamble: () => CONTEXT_SOURCES_PREAMBLE,
      preambleTool: () => CONTEXT_SOURCES_PREAMBLE_TOOL,
      sources: () => CONTEXT_SOURCES,
    };
  `;

  // estimateTokens lives outside both slices (it sits with the context-bar code), so it is
  // provided here rather than sliced in. It is a pure chars/3.5 estimate in the app.
  const prelude = `
    function estimateTokens(text) { return Math.ceil((text || '').length / 3.5); }
  `;

  vm.runInContext(prelude + stateBlock + '\nlet analysisDatasets = [];\n' + fnBlock + stubs + extraStubs, ctx);
  return { ctx, api: ctx.API, notes, errors, store };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────
// Deterministic stand-ins for the three sources that would otherwise read this machine.

/**
 * A canonical concept graph in the shape `graphSchemaInstruction` describes. Concepts are
 * given deliberately distinct vocabularies so a retrieval test can tell a real hit from a
 * lexical accident, and evidence weights straddle `conceptMapMinEvidence` so the
 * single-mention filter has something to filter.
 */
export function makeGraph({ conceptCount = 12 } = {}) {
  const specs = [
    ['tauri-error-handling', 'Tauri Error Handling', 'topic', 'Result types and error propagation across the Rust and webview boundary in Tauri apps.', 6],
    ['streaming-transport', 'Streaming Transport', 'topic', 'Server-sent events, chunk boundaries and reconnection for token streams.', 5],
    ['concept-map-priming', 'Concept Map Priming', 'macro', 'Freezing a rendered map once per chat so the prompt prefix stays reusable.', 9],
    ['vault-retrieval', 'Vault Retrieval', 'topic', 'Ranking local notes against a question, lexically or semantically.', 4],
    ['browser-history-context', 'Browser History Context', 'subtopic', 'Reading Chromium history and choosing recent versus most-visited pages.', 3],
    ['frontend-design-principles', 'Frontend Design Principles', 'macro', 'Distinctive, high-quality interfaces over generic component defaults.', 11],
    ['token-budgets', 'Token Budgets', 'topic', 'Trimming injected context to a character ceiling without turning it into a level filter.', 5],
    ['cancellation-semantics', 'Cancellation Semantics', 'topic', 'Stopping an in-flight generation without disturbing an unrelated one.', 4],
    ['persistence-atomicity', 'Persistence Atomicity', 'subtopic', 'Temp-file writes and rename ordering so a crash cannot truncate a transcript.', 3],
    ['single-mention-noise', 'Single Mention Noise', 'motif', 'Concepts seen once, which the evidence floor is meant to drop.', 2],
    ['clock', 'Clock', 'macro', 'A recurring surface element, macro by recurrence rather than by abstraction.', 8],
    ['magnifier', 'Magnifier', 'macro', 'Another recurrence artefact sitting beside genuinely abstract entries.', 7],
  ].slice(0, conceptCount);

  return {
    schema_version: 1,
    dataset: { id: 'fixture', run_id: 'run-1' },
    graph_id: 'fixture-graph',
    concepts: specs.map(([id, label, level, summary, weight]) => ({
      concept_id: id,
      canonical_label: label,
      level,
      parent_id: null,
      aliases: [],
      summary,
      subtopics: [],
      // cmEvidenceWeight counts records + chunks; split the weight across both.
      evidence: [{ chunk_id: `c-${id}`, record_ids: Array.from({ length: Math.max(1, weight - 1) }, (_, i) => `r-${id}-${i}`) }],
    })),
    events: [
      { event_id: 'e1', timestamp: '2026-03-01', concept_ids: ['streaming-transport'], summary: 'Reworked the SSE parser.' },
    ],
    edges: [
      { source: 'streaming-transport', target: 'cancellation-semantics', relationship: 'develops', weight: 1 },
    ],
    metrics: {},
  };
}

/** Writes library fixture files into a fresh temp directory and returns their paths. */
export function makeLibrary(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llc-lib-'));
  const written = [];
  for (const [name, text] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
    written.push(p);
  }
  return { dir, files: written };
}

/** Browser-history rows in the shape `browser_history_search` returns. */
export function makeHistory(rows) {
  return rows.map((r, i) => ({
    url: r.url,
    title: r.title,
    visitCount: r.visitCount ?? 1,
    // Deterministic clock: newest first at a fixed base so "recent" is testable.
    lastVisitMs: r.lastVisitMs ?? (Date.UTC(2026, 7, 10) - i * 3600_000),
    browser: r.browser || 'Vivaldi',
  }));
}

// ── Tauri bridge ─────────────────────────────────────────────────────────────────

export function installBridge(ctx, { historyItems = [], libraryRoot = null, semanticOrder = null, hermesDocs = null } = {}) {
  ctx.window.api.libraryCollect = async (sources) => {
    const files = [];
    const missing = [];
    const walk = (root, zone, base) => {
      let st;
      try { st = fs.statSync(root); } catch { missing.push(root); return; }
      if (st.isFile()) {
        files.push({
          path: root, zone, name: path.basename(root),
          rel: path.relative(base, root) || path.basename(root),
          text: fs.readFileSync(root, 'utf8'), truncated: false,
          chars: st.size, mtime: st.mtimeMs,
        });
        return;
      }
      // Folders matter: an earlier version of this stub handled only files, and payloads
      // silently came up a source short without failing.
      for (const entry of fs.readdirSync(root)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        walk(path.join(root, entry), zone, base);
      }
    };
    for (const s of sources) walk(s.path, s.zone || path.basename(s.path), s.path);
    files.sort((a, b) => b.mtime - a.mtime);
    return { files, stats: { missing, files: files.length } };
  };

  ctx.window.api.librarySearch = async () => {
    if (!semanticOrder) throw new Error('vault-search unreachable');
    return { results: semanticOrder.map((p, i) => ({ path: p, score: 1 - i * 0.01 })), roots: [libraryRoot].filter(Boolean) };
  };

  ctx.window.api.historySearch = async () => ({ items: historyItems, stats: { missing: [], profiles: ['Default'], scanned: historyItems.length } });

  ctx.window.api.hermesCollect = async () => hermesDocs || { root: '', indexText: '', indexFound: false, docs: [], stats: {} };

  ctx.window.api.analysisListGraphs = async () => ({ graphs: [] });
  ctx.window.api.analysisReadGraph = async () => null;
}

// ── Assertions ───────────────────────────────────────────────────────────────────

export class Suite {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failures = [];
    this.current = '';
  }

  group(title) {
    this.current = title;
    console.log(`\n  ${title}`);
  }

  ok(cond, msg, detail) {
    if (cond) {
      this.passed += 1;
      console.log(`    \x1b[32m✓\x1b[0m ${msg}`);
    } else {
      this.failures.push({ group: this.current, msg, detail });
      console.log(`    \x1b[31m✗\x1b[0m ${msg}`);
      if (detail !== undefined) console.log(`      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
  }

  eq(actual, expected, msg) {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    this.ok(same, msg, same ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  contains(haystack, needle, msg) {
    const hit = String(haystack || '').includes(needle);
    this.ok(hit, msg, hit ? undefined : `missing ${JSON.stringify(needle)}`);
  }

  excludes(haystack, needle, msg) {
    const hit = !String(haystack || '').includes(needle);
    this.ok(hit, msg, hit ? undefined : `unexpectedly present: ${JSON.stringify(needle)}`);
  }

  async section(title, fn) {
    this.group(title);
    try {
      await fn();
    } catch (err) {
      this.failures.push({ group: title, msg: 'threw', detail: err?.stack || String(err) });
      console.log(`    \x1b[31m✗\x1b[0m threw: ${err?.message || err}`);
    }
  }

  report() {
    const total = this.passed + this.failures.length;
    console.log(`\n${'─'.repeat(66)}`);
    if (this.failures.length === 0) {
      console.log(`\x1b[32m${this.name}: ${this.passed}/${total} assertions passed\x1b[0m`);
      return 0;
    }
    console.log(`\x1b[31m${this.name}: ${this.failures.length} of ${total} failed\x1b[0m`);
    for (const f of this.failures) {
      console.log(`  • [${f.group}] ${f.msg}`);
      if (f.detail) console.log(`    ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`);
    }
    return 1;
  }
}
