// Build one canonical concept map across all three providers from topic passes already
// on disk. No model calls: the LLM stage is the expensive one and it is already saved as
// `pass_topic_chunks.jsonl` per run, so canonization is a pure, repeatable function of it.
//
// The canonizer is loaded OUT OF renderer.js via vm slices (same technique as the
// context-sources test harness) so this runs the production code path rather than a
// reimplementation that could drift from it.
//
//   node tools/build-3provider-map.mjs [--limit 3000] [--out <path>] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = 'd:/Users/slaur/Documents/aikoodaus/local-llm-chat/src/renderer.js';
const ROOT = 'C:/Users/slaur/AppData/Roaming/com.slaur.local-llm-chat/data/analysis-projects';

// One entry per provider. `run` is the run whose topic pass covers 100% of that
// dataset's chunks — partial runs are the norm in these folders, so this is pinned
// rather than "newest", which would silently pick a 5-chunk test run.
const PROVIDERS = [
  { tag: 'anthropic', dataset: 'conversations_26lak8nm', dir: 'conversations_26lak8nm', run: 'run_mqnutnwp' },
  { tag: 'openai', dataset: 'openai_chat_9ntkj79k', dir: 'openai/openai_chat_9ntkj79k', run: 'run_mqp7h1gk' },
  { tag: 'grok', dataset: 'grok_prod-grok-backend_2cdbr7ch', dir: 'grok/grok_prod-grok-backend_2cdbr7ch', run: 'run_mru1zsty' },
];

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const CONCEPT_LIMIT = parseInt(argVal('--limit', '3000'), 10);
const DRY = args.includes('--dry');

/* -- load the real canonizer out of renderer.js ---------------------------- */
function loadCanonizer() {
  const src = fs.readFileSync(SRC, 'utf8');
  const cut = (a, b) => {
    const i = src.indexOf(a);
    const j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) throw new Error(`slice failed: ${a} .. ${b}`);
    return src.slice(i, j);
  };
  const blocks = [
    cut('function hashString(value) {', 'function truncateForPrompt('),
    cut('function sanitizeFastField(value, max = 300) {', 'function parseFastRecordIds('),
    cut('function uniqueTopicResults(results) {', 'function splitByPromptBudget('),
    cut('const CONCEPT_KEY_STOPWORDS = new Set([', 'async function canonizeAnalysisRunFast'),
  ].join('\n');

  // The slices reference a couple of app-level bindings that only exist for reporting.
  // Declared here so the canonizer runs unmodified rather than being edited for Node.
  const prelude = `let currentModel = 'google/gemma-4-26b-a4b (saved topic pass)';`;

  const ctx = { console, performance };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${prelude}\n${blocks}\nglobalThis.API = { canonize: deterministicGraphFromTopicResults, uniqueTopicResults };`, ctx);
  return ctx.API;
}

/* -- inputs ----------------------------------------------------------------- */
const readJsonl = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
};

function loadProvider(p) {
  const runDir = path.join(ROOT, p.dir, 'runs', p.run);
  const results = readJsonl(path.join(runDir, 'pass_topic_chunks.jsonl'));
  const chunks = readJsonl(path.join(ROOT, p.dir, 'normalized/chunks.jsonl'));

  // Chunk ids are assigned per dataset (`chunk_000048` exists in all three), so without a
  // provider prefix the same id from two providers would be counted as one chunk and the
  // evidence dedup would silently erase real, distinct evidence.
  const validRecordIds = new Set();
  for (const c of chunks) for (const r of c.record_ids || []) validRecordIds.add(`${p.tag}:${r}`);

  const tagged = results.map((r) => ({
    ...r,
    chunk_id: `${p.tag}:${r.chunk_id}`,
    source_dataset: p.tag,
    topics: (r.topics || []).map((t) => ({
      ...t,
      evidence_record_ids: (t.evidence_record_ids || []).map((id) => `${p.tag}:${id}`),
    })),
  }));

  return { ...p, results: tagged, totalChunks: chunks.length, validRecordIds };
}

/* -- build ------------------------------------------------------------------ */
const API = loadCanonizer();
const loaded = PROVIDERS.map(loadProvider);

const validRecordIds = new Set();
for (const p of loaded) for (const id of p.validRecordIds) validRecordIds.add(id);

const allResults = [];
for (const p of loaded) {
  const unique = API.uniqueTopicResults(p.results);
  const topicRows = unique.reduce((n, r) => n + (r.topics || []).length, 0);
  console.log(
    `${p.tag.padEnd(10)} run=${p.run} results=${String(unique.length).padStart(5)}/${p.totalChunks} chunks ` +
    `topicRows=${String(topicRows).padStart(6)} realRecordIds=${p.validRecordIds.size}`
  );
  allResults.push(...unique);
}

const started = Date.now();
const graph = API.canonize('three_provider', 'combined', allResults, 'fast', {
  validRecordIds,
  conceptLimit: CONCEPT_LIMIT,
  evidenceChunks: 12,
});
const elapsed = Date.now() - started;

graph.graph_id = `three_provider_${graph.concepts.length}`;
graph.dataset = { id: 'three_provider', run_id: 'combined' };
graph.provenance = {
  built_by: 'tools/build-3provider-map.mjs',
  canonized_from: loaded.map((p) => ({
    provider: p.tag, dataset: p.dataset, run: p.run,
    chunks: p.totalChunks, results: p.results.length,
  })),
  concept_limit: CONCEPT_LIMIT,
  canonization_duration_ms: elapsed,
  note: 'Single canonization pass over all three providers — not a reconciliation of finished graphs, so evidence_totals are exact rather than a lower bound.',
};

console.log(`\ncanonized ${allResults.length} chunk results -> ${graph.concepts.length} concepts, ` +
  `${graph.edges.length} edges, ${graph.events.length} events in ${elapsed}ms`);

if (DRY) { console.log('--dry: not writing'); process.exit(0); }

const out = argVal('--out', path.join(ROOT, 'reconciliations', 'three_provider_canonical.json'));
fs.writeFileSync(out, JSON.stringify(graph, null, 2));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
