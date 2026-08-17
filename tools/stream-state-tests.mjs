// Streaming state-machine tests — what the app does with a reply that did not finish.
//
//   node tools/stream-state-tests.mjs
//
// These drive the REAL `streamAssistantResponse` out of renderer.js against a stubbed
// `window.api.sendMessage`, with a DOM shim standing in for the transcript. The subject is
// the seam where three things have to agree after a stream ends: what is on screen, what is
// in `conversationHistory` (which the NEXT request is built from), and what reaches disk.
//
// They exist because that seam had two defects that only show up on an interrupted stream —
// the one path no LM Studio test can produce on demand:
//   • an error mid-stream deleted the whole visible answer, discarding text the user had
//     already read and the model had already generated;
//   • Stop kept the text on screen but never put it in conversationHistory, so the three
//     views disagreed until a reload resolved it by dropping the answer.
// Both are asserted below, in both the "server failed" and the "user pressed Stop" shapes.

import { loadRenderer, Suite } from './context-harness.mjs';

const t = new Suite('stream-state-tests');

// ── Minimal DOM ──────────────────────────────────────────────────────────────────
// Only what the streaming path touches: element creation, append/remove, class lists and
// the geometry the autoscroll reads.

function makeElement(tag = 'div') {
  const el = {
    tagName: tag,
    className: '',
    innerHTML: '',
    textContent: '',
    children: [],
    parent: null,
    dataset: {},
    style: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
    },
    appendChild(child) { child.parent = el; el.children.push(child); return child; },
    insertBefore(child) { child.parent = el; el.children.unshift(child); return child; },
    remove() {
      if (!el.parent) return;
      const i = el.parent.children.indexOf(el);
      if (i >= 0) el.parent.children.splice(i, 1);
      el.parent = null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    scrollHeight: 0, scrollTop: 0, clientHeight: 600,
    focus() {},
  };
  return el;
}

function makeDom() {
  const body = makeElement('body');
  const document = {
    body,
    createElement: makeElement,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  return { document, body };
}

// ── Loading the streaming path ───────────────────────────────────────────────────

const EXTRA_STUBS = `
  // Helpers that live outside the sliced range; stubbed to the smallest behaviour the
  // streaming path depends on.
  renderMarkdown = (s) => String(s == null ? '' : s);
  estimateTokens = (s) => Math.ceil(String(s || '').length / 3.5);
  updateContextBar = () => {};
  messageHasImages = () => false;
  buildApiMessagesForModel = (messages) => messages.map(m => ({ role: m.role, content: m.content }));
  analyzeMissingImagesForTextProjection = async () => {};
  createThinkingIndicator = () => {
    const el = messagesEl.appendChild(document.createElement('div'));
    el.className = 'thinking';
    return { remove: () => el.remove(), getElapsedSeconds: () => 0 };
  };
  // addMessage is the real transcript writer in the app; here it records what was rendered
  // and returns an element, so the tests can see the assistant/system/error bubbles.
  addMessage = (role, content, msgIndex) => {
    const el = messagesEl.appendChild(document.createElement('div'));
    el.className = 'message ' + role;
    el.innerHTML = typeof content === 'string' ? content : JSON.stringify(content);
    __rendered.push({ role, content, msgIndex, el });
    return el;
  };
  saveCurrentChat = async () => {
    if (!currentChat) return;
    // Mirrors the real one closely enough to observe: it snapshots the message array.
    __saves.push(JSON.parse(JSON.stringify(currentChat.messages || [])));
  };
  recordMeta = async (status) => { __meta.push(status); };

  globalThis.STREAM_API = {
    run: (opts) => streamAssistantResponse(opts || {}),
    set: (k, v) => { eval(k + ' = v'); },
    get: (k) => eval(k),
    stopNow: () => { activeGeneration?.finalizeStop?.(); },
  };
`;

function makeApp({ reply, history = [{ role: 'user', content: 'question' }] } = {}) {
  const { document, body } = makeDom();
  const rendered = [];
  const saves = [];
  const meta = [];

  const h = loadRenderer({
    extraStubs: EXTRA_STUBS,
    extraGlobals: {
      document,
      requestAnimationFrame: (fn) => setTimeout(() => fn(), 0),
      setTimeout,
      clearTimeout,
      __rendered: rendered,
      __saves: saves,
      __meta: meta,
    },
  });

  // The streaming path clears its stop timer through `window`, not the bare global.
  h.ctx.window.setTimeout = setTimeout;
  h.ctx.window.clearTimeout = clearTimeout;

  const S = h.ctx.STREAM_API;
  const messagesEl = makeElement('div');
  S.set('messagesEl', messagesEl);
  S.set('sendBtn', makeElement('button'));
  S.set('inputEl', makeElement('textarea'));
  S.set('branchBar', makeElement('div'));
  S.set('chatListEl', makeElement('div'));
  S.set('currentModel', 'fake/model');
  S.set('conversationHistory', history.slice());
  S.set('currentChat', { id: 'chat-1', title: 'T', created: '2026-01-01', model: 'fake/model', messages: history.slice() });
  S.set('conceptMapEnabled', false);
  S.set('libraryEnabled', false);
  S.set('historyEnabled', false);
  S.set('hermesEnabled', false);
  S.set('currentMaxTokens', 0);
  S.set('requestChatReasoning', false);
  S.set('autoScrollEnabled', false);

  // The provider stub: streams `chunks` through the callback, then resolves with `result`.
  h.ctx.window.api.sendMessage = async (messages, options, onChunk) => {
    for (const c of reply.chunks || []) onChunk(c);
    if (reply.stopDuring) h.ctx.STREAM_API.stopNow();
    return reply.result;
  };
  h.ctx.window.api.recordChatMeta = async () => {};
  h.ctx.window.api.saveChat = async () => ({ savedCount: 0 });

  return { h, S, rendered, saves, meta, messagesEl, document, body };
}

const settle = () => new Promise(r => setTimeout(r, 30));

// ── Baseline ─────────────────────────────────────────────────────────────────────

await t.section('A completed reply is rendered, kept in history and saved', async () => {
  const app = makeApp({ reply: { chunks: ['Hello ', 'world'], result: { content: 'Hello world', toolCalls: [] } } });
  await app.S.run();
  await settle();

  const history = app.S.get('conversationHistory');
  t.eq(history.length, 2, 'the assistant turn is appended to conversationHistory');
  t.eq(history[1].content, 'Hello world', 'with the streamed text');
  t.ok(app.saves.length > 0, 'and the chat is saved');
  t.eq(app.saves.at(-1).at(-1)?.content, 'Hello world', 'the saved transcript carries it');
  t.excludes(history[1].content, 'interrupted', 'a completed reply is not marked interrupted');
});

// ── Streaming interruption: the server failed partway ────────────────────────────

await t.section('A mid-stream error KEEPS the partial answer', async () => {
  // Pre-fix this deleted the bubble outright: a stall or a dropped connection after two
  // minutes of streaming left the user with an error and nothing else, even though the text
  // had already been generated and read.
  const app = makeApp({
    reply: {
      chunks: ['This answer was ', 'cut off mid-'],
      result: { error: 'Connection lost while streaming: body closed', content: 'This answer was cut off mid-', partial: true },
    },
  });
  await app.S.run();
  await settle();

  const history = app.S.get('conversationHistory');
  t.eq(history.length, 2, 'the partial answer becomes a real assistant turn');
  t.contains(history[1].content, 'This answer was cut off mid-', 'the streamed text survives the error');
  t.contains(history[1].content, 'interrupted', 'and is marked as partial rather than passed off as complete');
  t.ok(app.saves.length > 0, 'the partial answer is persisted, so a reload keeps it');
  t.contains(app.saves.at(-1).at(-1)?.content, 'This answer was cut off mid-', 'the saved transcript has it');

  const errorBubbles = app.rendered.filter(r => r.role === 'error');
  t.eq(errorBubbles.length, 1, 'the error is still reported to the user');
  t.contains(errorBubbles[0].content, 'Connection lost', 'with the server message');
  t.eq(app.meta, ['error'], 'one exchange leaves exactly one meta entry, not two');
});

await t.section('A mid-stream error with NO text adds no assistant turn', async () => {
  const app = makeApp({ reply: { chunks: [], result: { error: 'Server error 503: Model is loading' } } });
  await app.S.run();
  await settle();

  t.eq(app.S.get('conversationHistory').length, 1, 'nothing arrived, so nothing is invented');
  t.eq(app.rendered.filter(r => r.role === 'assistant').length, 0, 'and no empty assistant bubble is left behind');
  t.eq(app.rendered.filter(r => r.role === 'error').length, 1, 'the error is reported');
});

// ── Cancellation ─────────────────────────────────────────────────────────────────

await t.section('A cancelled reply keeps and SAVES what had streamed', async () => {
  // Pre-fix the text stayed on screen but never reached conversationHistory, so the screen,
  // the array the next request is built from, and the file on disk all disagreed.
  const app = makeApp({
    reply: { chunks: ['tok0 ', 'tok1 ', 'tok2 '], result: { cancelled: true, content: 'tok0 tok1 tok2 ', partial: true } },
  });
  await app.S.run();
  await settle();

  const history = app.S.get('conversationHistory');
  t.eq(history.length, 2, 'the partial answer is in conversationHistory');
  t.contains(history[1].content, 'tok0 tok1 tok2', 'with everything that streamed');
  t.contains(history[1].content, 'interrupted', 'marked as partial');
  t.ok(app.saves.length > 0, 'and saved, so reopening the chat still shows it');
});

await t.section('Pressing Stop mid-stream persists exactly once', async () => {
  // The Stop path returns early from the tool loop, which used to skip all finalization.
  // finalizeStop and the early return can now both reach the save, so this also checks the
  // idempotence guard: a duplicated assistant turn would corrupt the transcript.
  const app = makeApp({
    reply: { chunks: ['partial answer text'], stopDuring: true, result: { cancelled: true, content: 'partial answer text', partial: true } },
  });
  await app.S.run();
  await settle();

  const history = app.S.get('conversationHistory');
  const assistantTurns = history.filter(m => m.role === 'assistant');
  t.eq(assistantTurns.length, 1, 'exactly one assistant turn, not two');
  t.contains(assistantTurns[0].content, 'partial answer text', 'carrying the streamed text');
  t.contains(assistantTurns[0].content, 'interrupted', 'marked as partial');
});

await t.section('Stop before any text arrives leaves no assistant turn', async () => {
  const app = makeApp({ reply: { chunks: [], stopDuring: true, result: { cancelled: true, content: '' } } });
  await app.S.run();
  await settle();
  t.eq(app.S.get('conversationHistory').length, 1, 'nothing streamed, so nothing is saved');
  t.eq(app.rendered.filter(r => r.role === 'assistant').length, 0, 'and no empty bubble is left');
});

// ── The three views must agree ───────────────────────────────────────────────────

await t.section('Screen, history and disk agree after an interruption', async () => {
  const app = makeApp({
    reply: { chunks: ['visible text'], result: { error: 'Stream stalled — no data for 120s', content: 'visible text', partial: true } },
  });
  await app.S.run();
  await settle();

  const history = app.S.get('conversationHistory');
  const saved = app.saves.at(-1);
  t.eq(history.length, saved.length, 'conversationHistory and the saved transcript have the same number of turns');
  t.eq(history.at(-1).content, saved.at(-1).content, 'and the same final message');

  // Message indices are what the DOM is keyed by for edit/regenerate; a turn on screen that
  // is missing from the array shifts every index after it.
  const assistantOnScreen = app.messagesEl.children.filter(c => String(c.className).includes('assistant'));
  t.eq(assistantOnScreen.length, history.filter(m => m.role === 'assistant').length,
    'the number of assistant bubbles on screen matches the number in history');
});

await t.section('A reload after an interruption still shows the answer', async () => {
  const app = makeApp({
    reply: { chunks: ['survives the reload'], result: { error: 'Connection lost while streaming', content: 'survives the reload', partial: true } },
  });
  await app.S.run();
  await settle();

  // What loadChatById does: rebuild conversationHistory from the persisted messages.
  const persisted = app.saves.at(-1);
  const reloaded = persisted.map(m => ({ role: m.role, content: m.content }));
  t.eq(reloaded.length, 2, 'the reloaded chat has both turns');
  t.contains(reloaded[1].content, 'survives the reload', 'the partial answer is still there after a reload');
});

// ── The next request sees what the user sees ─────────────────────────────────────

await t.section('The next turn is built from a history that includes the partial answer', async () => {
  const app = makeApp({
    reply: { chunks: ['first partial'], result: { error: 'Stream stalled', content: 'first partial', partial: true } },
  });
  await app.S.run();
  await settle();

  // Second send on the same chat: capture what is actually put on the wire.
  let sentMessages = null;
  app.h.ctx.window.api.sendMessage = async (messages, options, onChunk) => {
    sentMessages = messages;
    onChunk('second reply');
    return { content: 'second reply', toolCalls: [] };
  };
  const history = app.S.get('conversationHistory');
  history.push({ role: 'user', content: 'follow-up' });
  app.S.set('conversationHistory', history);
  await app.S.run();
  await settle();

  const roles = sentMessages.map(m => m.role);
  t.ok(roles.includes('assistant'), 'the interrupted answer is part of the next request');
  const assistantSent = sentMessages.find(m => m.role === 'assistant');
  t.contains(assistantSent.content, 'first partial', 'so the model is not told it never answered');
  t.contains(assistantSent.content, 'interrupted', 'and can see the answer was cut short');
});

// ── Cancel scope ─────────────────────────────────────────────────────────────────

await t.section('Chat requests are tagged with the chat cancel scope', async () => {
  // The Rust side cancels by scope; if the tag stops being sent, the composer's Stop
  // silently goes back to cancelling Data Analysis too.
  let seenOptions = null;
  const app = makeApp({ reply: { chunks: ['x'], result: { content: 'x', toolCalls: [] } } });
  app.h.ctx.window.api.sendMessage = async (messages, options, onChunk) => {
    seenOptions = options;
    onChunk('x');
    return { content: 'x', toolCalls: [] };
  };
  await app.S.run();
  await settle();
  t.eq(seenOptions?.cancelScope, 'chat', 'chat sends carry cancelScope: "chat"');
});

process.exit(t.report());
