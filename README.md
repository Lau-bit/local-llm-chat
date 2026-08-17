# Local LLM Chat

> **Work in progress** — this app is in active development. Expect rough edges, missing features, and breaking changes.

A desktop chat client for local LLM servers (LM Studio, Ollama, and any OpenAI-compatible endpoint).

Built with [Tauri 2](https://tauri.app) + vanilla HTML/CSS/JS frontend and a Rust backend.

## Features

- Connects to any OpenAI-compatible local server
- Streaming responses with autoscroll
- Chat history stored as plain `.txt` files
- Branch / edit messages (forks conversation into a new chat)
- Private (hidden) chats
- Read marker
- Multiple themes
- Developer console for inspecting requests
- Five **context sources** you can toggle per message — web search, a concept map built from your own
  past conversations, a local folder of notes, browser history, and a read-only view of an agent's
  warm-memory workspace — see [docs/context-sources.md](docs/context-sources.md) for how each is
  assembled and what was measured

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) toolchain
- A running local LLM server (default: `http://localhost:1234`)

## Running

```
npm install
npm start
```

## Building

```
npm run build
```

## Tests

No model and no LLM server required — everything runs against a deterministic fake.

```
npm test          # context-source pipeline + streaming state machine (Node, no deps)
npm run test:rust # SSE parser unit tests + provider tests against the fake server
```

`test:rust` builds into `src-tauri/target/test` rather than the default target dir, so it
still runs while the app is open — otherwise cargo cannot relink the binary the running app
is holding and fails with `os error 5`.

`tools/fake-server.mjs` is an OpenAI-compatible stand-in for LM Studio in which **the
scenario is the model id** — `/v1/models` advertises one model per behaviour, so you select
a failure by selecting a model. It can produce the things a real server only produces when
something has already gone wrong: an error object arriving inside an otherwise-healthy 200
stream, a socket dropped mid-generation, a stall after partial output, tool-call arguments
split so they only parse once reassembled, multi-byte characters cut across chunk
boundaries.

To drive the app against it by hand:

```
npm run fake-server            # http://127.0.0.1:8234
```

then point Settings → Server URL at `http://127.0.0.1:8234`, hit Connect, and pick a
scenario from the model dropdown. `GET /__scenarios` lists them.

| suite | what it covers |
|---|---|
| `src-tauri/src/stream_parse.rs` | SSE accumulation: malformed lines, error shapes, tool-call reassembly, UTF-8 chunk splits |
| `src-tauri/tests/provider_stream.rs` | the same parser off a real socket, plus server start/stop, model switching, cancellation, stalls, dropped connections, concurrency |
| `tools/context-tests.mjs` | the five context sources: priming, budgets, retrieval, empty results, reload, concurrent chats |
| `tools/stream-state-tests.mjs` | what happens to a reply that did not finish — screen, history and disk must agree |

## License

MIT
