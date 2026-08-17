// Deterministic fake OpenAI-compatible server (an LM Studio stand-in).
//
// Why this exists: every earlier test of this app either needed LM Studio loaded with a real
// model (slow, non-deterministic, and unable to produce a malformed response on purpose) or
// tested a reimplementation of the pipeline instead of the pipeline. This server produces
// byte-exact streams on demand, including the failures a real server only produces when
// something has already gone wrong — a socket dropped mid-stream, an error object inside an
// otherwise-healthy SSE stream, arguments split so a tool call only parses if reassembled.
//
// THE SCENARIO IS THE MODEL ID. `/v1/models` advertises one model per scenario, so a test —
// or a human driving the real app — selects behaviour by selecting a model, and model
// switching is exercised for free. Nothing here is random or clock-dependent: the same
// request always produces the same bytes in the same order, apart from the scenarios whose
// whole subject is timing (`slow/*`, `hang/*`), which are driven by explicit delays.
//
// Run:  node tools/fake-server.mjs [--port 8234] [--quiet]
// Then point the app at http://127.0.0.1:8234 (Settings → Server URL → Connect).
//
// Control plane (tests use it; harmless in manual use):
//   GET  /__requests          every request received, with parsed body
//   POST /__reset             clear the recorded requests
//   POST /__control           {"models": [...]} restrict the advertised model list,
//                             {"offline": true} make /v1/* fail like a stopped server

import http from 'node:http';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 8234;
const QUIET = args.includes('--quiet');

// ── Scenario catalogue ────────────────────────────────────────────────────────────
// Each scenario is a generator over "steps". A step is either a chunk of bytes to write,
// a delay, or a socket-level action. Keeping them declarative makes the stream inspectable
// from a test without running the server.

const CONTENT_TOKENS = ['Local', ' models', ' stream', ' one', ' token', ' at', ' a', ' time', '.'];

const sse = obj => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (content, extra = {}) =>
  sse({
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fake',
    choices: [{ index: 0, delta: { content, ...extra }, finish_reason: null }],
  });
const finish = (reason = 'stop') =>
  sse({
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fake',
    choices: [{ index: 0, delta: {}, finish_reason: reason }],
  });
const DONE = 'data: [DONE]\n\n';

// A tool-call delta as LM Studio emits it: id and name once, arguments as fragments.
const toolDelta = (index, fields) =>
  sse({
    choices: [{ index: 0, delta: { tool_calls: [{ index, ...fields }] }, finish_reason: null }],
  });

const SCENARIOS = {
  // ── Healthy ─────────────────────────────────────────────────────────────────────
  'ok/stream': {
    desc: 'Normal token stream ending in [DONE].',
    steps: () => [
      ...CONTENT_TOKENS.map(t => ({ write: delta(t) })),
      { write: finish() },
      { write: DONE },
    ],
  },

  'ok/unicode-split': {
    desc: 'Multi-byte characters split across TCP chunk boundaries (UTF-8 boundary handling).',
    // The payload is written as raw bytes cut mid-character, which is exactly what a network
    // chunk boundary does and what decoding each chunk independently would corrupt.
    steps: () => {
      const line = delta('äöü — 日本語 🎹 done');
      const bytes = Buffer.from(line, 'utf8');
      const cuts = [];
      // Cut every 7 bytes: guarantees several cuts land inside multi-byte sequences.
      for (let i = 0; i < bytes.length; i += 7) cuts.push({ write: bytes.subarray(i, i + 7) });
      return [...cuts, { write: finish() }, { write: DONE }];
    },
  },

  'ok/empty-content': {
    desc: 'A well-formed stream that carries no content at all (finish_reason only).',
    steps: () => [{ write: finish() }, { write: DONE }],
  },

  'ok/crlf': {
    desc: 'CRLF line endings rather than LF.',
    steps: () => [
      { write: CONTENT_TOKENS.map(t => delta(t).replace(/\n/g, '\r\n')).join('') },
      { write: finish().replace(/\n/g, '\r\n') },
      { write: 'data: [DONE]\r\n\r\n' },
    ],
  },

  'ok/comments': {
    desc: 'SSE keep-alive comments and event: lines interleaved with data.',
    steps: () => [
      { write: ': keep-alive\n\n' },
      { write: delta('Hello') },
      { write: 'event: ping\ndata: {"noise":true}\n\n' },
      { write: delta(' world') },
      { write: finish() },
      { write: DONE },
    ],
  },

  // ── Transport-level failures ────────────────────────────────────────────────────
  'abort/midstream': {
    desc: 'Sends real content, then destroys the socket without [DONE].',
    steps: () => [
      { write: delta('This answer was') },
      { write: delta(' cut off mid-') },
      { destroy: true },
    ],
  },

  'abort/immediate': {
    desc: 'Destroys the socket after headers, before any data.',
    steps: () => [{ destroy: true }],
  },

  'stall/after-content': {
    desc: 'Sends content, then goes silent forever (exercises the stall timeout).',
    steps: () => [
      { write: delta('Starting to answer') },
      { write: delta(' and then the server') },
      { hold: true },
    ],
  },

  'hang/no-headers': {
    desc: 'Accepts the connection and never sends response headers.',
    raw: 'hang',
  },

  // ── HTTP-level failures ─────────────────────────────────────────────────────────
  'http/500': { desc: 'HTTP 500 with a JSON error body.', http: { status: 500, body: { error: { message: 'Internal server error', type: 'server_error' } } } },
  'http/401': { desc: 'HTTP 401 — server requires an API key.', http: { status: 401, body: { error: { message: 'Invalid API key', type: 'invalid_request_error' } } } },
  'http/404-model': { desc: 'HTTP 404 — model not found (model was unloaded).', http: { status: 404, body: { error: { message: "Model 'x' not found. Load it first.", type: 'invalid_request_error' } } } },
  'http/400-context': { desc: 'HTTP 400 — prompt exceeds the context length.', http: { status: 400, body: { error: { message: 'Trying to keep the first 66000 tokens when context the overflows. However, the model is loaded with context length of only 65536 tokens', type: 'invalid_request_error' } } } },
  'http/503-loading': { desc: 'HTTP 503 — model is still loading.', http: { status: 503, body: { error: { message: 'Model is loading', type: 'service_unavailable' } } } },
  'http/html-error': { desc: 'A proxy returning HTML instead of JSON.', http: { status: 502, raw: '<html><body><h1>502 Bad Gateway</h1></body></html>', contentType: 'text/html' } },

  // ── Errors delivered INSIDE a 200 stream ────────────────────────────────────────
  // These are the ones a real server only produces when generation fails after it has
  // already committed to a 200, e.g. running out of VRAM partway through.
  'sse/error-object': {
    desc: 'Content, then an error OBJECT mid-stream (the shape llama.cpp/LM Studio emit).',
    steps: () => [
      { write: delta('Partial answer before') },
      { write: delta(' the GPU ran out') },
      { write: sse({ error: { message: 'CUDA out of memory', type: 'server_error', code: 500 } }) },
    ],
  },

  'sse/error-string': {
    desc: 'Content, then an error delivered as a bare string.',
    steps: () => [
      { write: delta('Partial answer') },
      { write: sse({ error: 'model unloaded during generation' }) },
    ],
  },

  'sse/error-nested-only': {
    desc: 'An error object with no content preceding it.',
    steps: () => [{ write: sse({ error: { message: 'Failed to load model', type: 'server_error' } }) }],
  },

  // ── Malformed but non-fatal payloads ────────────────────────────────────────────
  'malformed/bad-json': {
    desc: 'An unparseable data line between two good ones.',
    steps: () => [
      { write: delta('before') },
      { write: 'data: {"choices":[{"delta":{"content":"broken\n\n' },
      { write: delta(' after') },
      { write: finish() },
      { write: DONE },
    ],
  },

  'malformed/no-choices': {
    desc: 'Well-formed JSON with no choices array.',
    steps: () => [
      { write: delta('a') },
      { write: sse({ id: 'x', object: 'chat.completion.chunk' }) },
      { write: delta('b') },
      { write: finish() },
      { write: DONE },
    ],
  },

  'malformed/null-content': {
    desc: 'delta.content is null / a number / missing, rather than a string.',
    steps: () => [
      { write: sse({ choices: [{ index: 0, delta: { content: null } }] }) },
      { write: sse({ choices: [{ index: 0, delta: { content: 42 } }] }) },
      { write: sse({ choices: [{ index: 0, delta: {} }] }) },
      { write: delta('only this is real') },
      { write: finish() },
      { write: DONE },
    ],
  },

  'malformed/no-done': {
    desc: 'Content then a clean EOF, with no [DONE] sentinel.',
    steps: () => [...CONTENT_TOKENS.map(t => ({ write: delta(t) })), { write: finish() }],
  },

  'malformed/no-trailing-newline': {
    desc: 'The final data line arrives without its terminating newline before EOF.',
    steps: () => [
      { write: delta('complete line') },
      { write: 'data: {"choices":[{"index":0,"delta":{"content":"dangling"}}]}' },
    ],
  },

  'malformed/giant-line': {
    desc: 'A single data line far larger than one TCP segment.',
    steps: () => [{ write: delta('x'.repeat(400_000)) }, { write: finish() }, { write: DONE }],
  },

  // ── Tool calls ──────────────────────────────────────────────────────────────────
  'tools/split-args': {
    desc: 'One concept_search call whose arguments arrive as fragments.',
    steps: () => [
      { write: toolDelta(0, { id: 'call_1', type: 'function', function: { name: 'concept_search', arguments: '' } }) },
      { write: toolDelta(0, { function: { arguments: '{"qu' } }) },
      { write: toolDelta(0, { function: { arguments: 'ery":"tau' } }) },
      { write: toolDelta(0, { function: { arguments: 'ri error han' } }) },
      { write: toolDelta(0, { function: { arguments: 'dling","limit":8}' } }) },
      { write: finish('tool_calls') },
      { write: DONE },
    ],
  },

  'tools/two-parallel': {
    desc: 'Two tool calls whose fragments interleave by index.',
    steps: () => [
      { write: toolDelta(0, { id: 'call_a', type: 'function', function: { name: 'concept_search', arguments: '' } }) },
      { write: toolDelta(1, { id: 'call_b', type: 'function', function: { name: 'concept_search', arguments: '' } }) },
      { write: toolDelta(0, { function: { arguments: '{"query":"al' } }) },
      { write: toolDelta(1, { function: { arguments: '{"query":"be' } }) },
      { write: toolDelta(0, { function: { arguments: 'pha"}' } }) },
      { write: toolDelta(1, { function: { arguments: 'ta"}' } }) },
      { write: finish('tool_calls') },
      { write: DONE },
    ],
  },

  'tools/no-index': {
    desc: 'Tool-call deltas that omit `index` entirely (some servers do).',
    steps: () => [
      { write: sse({ choices: [{ index: 0, delta: { tool_calls: [{ id: 'call_z', type: 'function', function: { name: 'concept_search', arguments: '' } }] } }] }) },
      { write: sse({ choices: [{ index: 0, delta: { tool_calls: [{ function: { arguments: '{"query":"x"}' } }] } }] }) },
      { write: finish('tool_calls') },
      { write: DONE },
    ],
  },

  'tools/malformed-args': {
    desc: 'A tool call whose reassembled arguments are not valid JSON.',
    steps: () => [
      { write: toolDelta(0, { id: 'call_m', type: 'function', function: { name: 'concept_search', arguments: '{"query": ' } }) },
      { write: finish('tool_calls') },
      { write: DONE },
    ],
  },

  'tools/then-text': {
    desc: 'Content and tool_calls in the same stream.',
    steps: () => [
      { write: delta('Let me look that up. ') },
      { write: toolDelta(0, { id: 'call_t', type: 'function', function: { name: 'concept_search', arguments: '{"query":"kubernetes"}' } }) },
      { write: finish('tool_calls') },
      { write: DONE },
    ],
  },

  // ── Reasoning ───────────────────────────────────────────────────────────────────
  'reasoning/reject': {
    desc: 'Rejects reasoning_effort/enable_thinking with 400; succeeds once they are dropped.',
    conditional: body => {
      const hasReasoning =
        body?.reasoning_effort !== undefined ||
        body?.enable_thinking !== undefined ||
        body?.thinking !== undefined;
      if (hasReasoning) {
        return { http: { status: 400, body: { error: { message: "Unrecognized request argument: 'reasoning_effort'", type: 'invalid_request_error' } } } };
      }
      return { steps: () => [{ write: delta('Answered after the reasoning fallback.') }, { write: finish() }, { write: DONE }] };
    },
  },

  'reasoning/only-thinking': {
    desc: 'Spends the whole budget on reasoning_content and returns no content.',
    steps: () => [
      { write: delta('', { reasoning_content: 'Thinking hard about this' }) },
      { write: delta('', { reasoning_content: ' and still thinking' }) },
      { write: finish('length') },
      { write: DONE },
    ],
  },

  // ── Timing ──────────────────────────────────────────────────────────────────────
  'slow/drip': {
    desc: 'One token every 300 ms for 60 tokens — room to cancel mid-stream.',
    steps: () => {
      const out = [];
      for (let i = 0; i < 60; i++) {
        out.push({ delay: 300 });
        out.push({ write: delta(`tok${i} `) });
      }
      out.push({ write: finish() });
      out.push({ write: DONE });
      return out;
    },
  },

  'slow/ttfb': {
    desc: 'Five seconds before the first token, then a normal stream.',
    steps: () => [
      { delay: 5000 },
      ...CONTENT_TOKENS.map(t => ({ write: delta(t) })),
      { write: finish() },
      { write: DONE },
    ],
  },

  // ── Introspection ───────────────────────────────────────────────────────────────
  'echo/request': {
    desc: 'Streams the received request back as JSON — lets a test assert what was sent.',
    steps: (body) => {
      const payload = JSON.stringify({
        model: body?.model,
        messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
        roles: (body?.messages || []).map(m => m.role),
        systemContents: (body?.messages || []).filter(m => m.role === 'system').map(m => String(m.content || '')),
        totalChars: (body?.messages || []).reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0),
        hasTools: Array.isArray(body?.tools) && body.tools.length > 0,
        toolNames: (body?.tools || []).map(t => t?.function?.name),
        temperature: body?.temperature,
        max_tokens: body?.max_tokens,
        response_format: body?.response_format,
        reasoning_effort: body?.reasoning_effort,
        enable_thinking: body?.enable_thinking,
        stream: body?.stream,
      });
      // Split across several deltas so the caller must reassemble to parse it.
      const parts = payload.match(/[\s\S]{1,64}/g) || [];
      return [...parts.map(p => ({ write: delta(p) })), { write: finish() }, { write: DONE }];
    },
  },
};

// ── Server state ──────────────────────────────────────────────────────────────────
const recorded = [];
let allowedModels = null;   // null = advertise everything
let offline = false;

const MODEL_IDS = Object.keys(SCENARIOS);

function modelList() {
  const ids = allowedModels || MODEL_IDS;
  return ids.map(id => ({
    id,
    object: 'model',
    owned_by: 'fake',
    // Mirrors LM Studio's shape closely enough for get_models' context-length probing.
    max_context_length: id === 'http/400-context' ? 4096 : 65536,
    meta: { n_context_train: id === 'http/400-context' ? 4096 : 65536 },
    description: SCENARIOS[id]?.desc || '',
  }));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const log = (...a) => { if (!QUIET) console.log(...a); };

async function runSteps(res, steps) {
  for (const step of steps) {
    if (step.delay) {
      await new Promise(r => setTimeout(r, step.delay));
      if (res.destroyed || res.writableEnded) return;
    }
    if (step.destroy) {
      res.socket?.destroy();
      return;
    }
    if (step.hold) {
      // Never resolves; the connection stays open and silent until the client gives up.
      await new Promise(() => {});
      return;
    }
    if (step.write !== undefined) {
      if (res.destroyed || res.writableEnded) return;
      res.write(step.write);
      // Flush each step as its own TCP write so chunk boundaries are where the scenario
      // puts them rather than wherever Node's buffering happens to coalesce them.
      await new Promise(r => setImmediate(r));
    }
  }
  if (!res.destroyed && !res.writableEnded) res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const bodyText = await readBody(req);
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* keep null */ }

  recorded.push({
    at: recorded.length,
    method: req.method,
    path,
    headers: req.headers,
    body,
    bodyText,
  });

  const json = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // ── Control plane ───────────────────────────────────────────────────────────────
  if (path === '/__requests') return json(200, { requests: recorded });
  if (path === '/__reset') { recorded.length = 0; allowedModels = null; offline = false; return json(200, { ok: true }); }
  if (path === '/__control') {
    if (body && Object.prototype.hasOwnProperty.call(body, 'models')) allowedModels = body.models;
    if (body && Object.prototype.hasOwnProperty.call(body, 'offline')) offline = !!body.offline;
    return json(200, { ok: true, allowedModels, offline });
  }
  if (path === '/__scenarios') {
    return json(200, { scenarios: MODEL_IDS.map(id => ({ id, desc: SCENARIOS[id].desc })) });
  }

  // `offline` simulates the server process being stopped while the app keeps running:
  // the port still answers (the control plane does), but every real endpoint refuses.
  if (offline && path.startsWith('/v1/')) {
    res.socket?.destroy();
    return;
  }

  // ── OpenAI-compatible surface ───────────────────────────────────────────────────
  if (path === '/v1/models') {
    log(`  GET /v1/models -> ${(allowedModels || MODEL_IDS).length} models`);
    return json(200, { object: 'list', data: modelList() });
  }

  // LM Studio's native preload endpoint, used by load_model.
  if (path === '/api/v1/models/load') {
    const model = body?.model || '';
    if (allowedModels && !allowedModels.includes(model)) {
      return json(404, { error: { message: `Model '${model}' not found`, type: 'invalid_request_error' } });
    }
    return json(200, { ok: true, model });
  }

  if (path === '/v1/chat/completions') {
    const model = body?.model || '';
    let scenario = SCENARIOS[model];

    if (!scenario) {
      log(`  POST /v1/chat/completions -> unknown model ${JSON.stringify(model)}`);
      return json(404, { error: { message: `Model '${model}' not found. Load it first.`, type: 'invalid_request_error' } });
    }
    if (allowedModels && !allowedModels.includes(model)) {
      return json(404, { error: { message: `Model '${model}' is not loaded`, type: 'invalid_request_error' } });
    }

    // Conditional scenarios inspect the request before deciding (the reasoning fallback).
    if (scenario.conditional) scenario = scenario.conditional(body);

    log(`  POST /v1/chat/completions -> ${model}`);

    if (scenario.raw === 'hang') return;                 // never respond at all

    if (scenario.http) {
      const { status, body: errBody, raw, contentType } = scenario.http;
      res.writeHead(status, { 'Content-Type': contentType || 'application/json' });
      return res.end(raw !== undefined ? raw : JSON.stringify(errBody));
    }

    // Non-streaming requests still need to work (the app streams, but tests and other
    // clients may not).
    if (body?.stream === false) {
      const steps = scenario.steps(body);
      let content = '';
      for (const s of steps) {
        if (typeof s.write !== 'string') continue;
        for (const line of s.write.split('\n')) {
          if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
          try {
            const ev = JSON.parse(line.slice(6));
            const d = ev?.choices?.[0]?.delta?.content;
            if (typeof d === 'string') content += d;
          } catch { /* scenario is deliberately malformed */ }
        }
      }
      return json(200, {
        id: 'chatcmpl-fake', object: 'chat.completion', created: 0, model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    return runSteps(res, scenario.steps(body));
  }

  return json(404, { error: { message: `Unknown path ${path}`, type: 'invalid_request_error' } });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`fake LM Studio listening on http://127.0.0.1:${PORT}`);
  log(`${MODEL_IDS.length} scenarios — each is a model id. GET /__scenarios to list them.`);
});

export { SCENARIOS, PORT };
