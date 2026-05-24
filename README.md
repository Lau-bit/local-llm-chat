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

## License

MIT
