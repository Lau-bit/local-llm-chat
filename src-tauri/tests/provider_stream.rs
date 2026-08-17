//! End-to-end provider tests against `tools/fake-server.mjs`.
//!
//! The unit tests in `src/stream_parse.rs` feed the parser bytes from a string. These feed
//! it bytes off a real socket, from a real HTTP response, with the chunk boundaries the OS
//! actually produces — which is the only way to cover the failures that are transport
//! events rather than payloads: a server that stops mid-generation, one that accepts the
//! connection and never answers, one that is not running at all, and a request cancelled
//! while tokens are still arriving.
//!
//! The test binary starts and stops the fake server itself, so `cargo test` needs nothing
//! running. It needs `node` on PATH; if node is missing the tests skip rather than fail,
//! since a Rust-only checkout should still be able to run `cargo test`.

use local_llm_chat_lib::stream_parse::{take_complete_lines, StreamAccum};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

use futures_util::StreamExt;
use serde_json::{json, Value};

const STALL_TIMEOUT: Duration = Duration::from_secs(3);

// ── Fake-server lifecycle ────────────────────────────────────────────────────────

struct FakeServer {
    child: Child,
    port: u16,
}

impl FakeServer {
    async fn start(port: u16) -> Option<Self> {
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../tools/fake-server.mjs");
        let child = Command::new("node")
            .arg(script)
            .arg("--port")
            .arg(port.to_string())
            .arg("--quiet")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .ok()?;
        let server = FakeServer { child, port };
        // Poll until it answers rather than sleeping a fixed time.
        for _ in 0..100 {
            if reqwest::get(server.url("/__scenarios")).await.is_ok() {
                return Some(server);
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        None
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{}", self.port, path)
    }

    async fn stop(mut self) {
        let _ = self.child.kill().await;
    }
}

/// Every test picks its own port so the suite can run without a shared fixture and without
/// tests colliding when cargo runs them in parallel.
macro_rules! server_test {
    ($name:ident, $port:expr, $server:ident, $body:block) => {
        #[tokio::test]
        async fn $name() {
            let Some($server) = FakeServer::start($port).await else {
                eprintln!("skipping {}: could not start tools/fake-server.mjs (is node on PATH?)", stringify!($name));
                return;
            };
            $body
            $server.stop().await;
        }
    };
}

// ── The production streaming loop, minus Tauri ───────────────────────────────────
// This mirrors post_stream's loop exactly: same timeouts, same cancel select, same
// buffer handling, same accumulator. What it drops is the window handle and the IPC
// channel, neither of which affects what the parser sees.

#[derive(Debug)]
struct Outcome {
    content: String,
    tool_calls: Vec<Value>,
    error: Option<String>,
    cancelled: bool,
    emitted: Vec<String>,
}

impl Outcome {
    /// What the frontend receives: interrupted paths still carry the text that arrived.
    fn partial(&self) -> bool {
        (self.error.is_some() || self.cancelled) && !self.content.is_empty()
    }
}

async fn stream_chat(
    endpoint: &str,
    body: Value,
    cancel_rx: &mut oneshot::Receiver<()>,
) -> Outcome {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .build()
        .unwrap();

    let mut accum = StreamAccum::new();
    let mut emitted = Vec::new();

    let request = client.post(endpoint).json(&body).send();
    let response = tokio::select! {
        _ = &mut *cancel_rx => {
            return Outcome { content: accum.content, tool_calls: accum.tool_calls, error: None, cancelled: true, emitted };
        }
        r = tokio::time::timeout(Duration::from_secs(5), request) => match r {
            Ok(inner) => inner,
            Err(_) => return Outcome { content: String::new(), tool_calls: vec![], error: Some("no response headers".into()), cancelled: false, emitted },
        },
    };

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            return Outcome { content: String::new(), tool_calls: vec![], error: Some(format!("Connection failed: {e}")), cancelled: false, emitted }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Outcome {
            content: String::new(),
            tool_calls: vec![],
            error: Some(format!("Server error {status}: {text}")),
            cancelled: false,
            emitted,
        };
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    loop {
        let next = tokio::select! {
            _ = &mut *cancel_rx => {
                return Outcome { content: accum.content, tool_calls: accum.tool_calls, error: None, cancelled: true, emitted };
            }
            item = tokio::time::timeout(STALL_TIMEOUT, stream.next()) => item,
        };

        let Some(item) = (match next {
            Ok(v) => v,
            Err(_) => {
                return Outcome { content: accum.content, tool_calls: accum.tool_calls, error: Some("Stream stalled".into()), cancelled: false, emitted }
            }
        }) else {
            break;
        };

        let bytes = match item {
            Ok(b) => b,
            Err(e) => {
                return Outcome { content: accum.content, tool_calls: accum.tool_calls, error: Some(format!("Connection lost while streaming: {e}")), cancelled: false, emitted }
            }
        };

        buffer.extend_from_slice(&bytes);
        let Some(text) = take_complete_lines(&mut buffer) else { continue };
        for line in text.split('\n') {
            if let Some(d) = accum.apply_line(line) {
                emitted.push(d);
            }
            if accum.error.is_some() {
                break;
            }
        }
        if accum.error.is_some() {
            break;
        }
    }

    Outcome { content: accum.content, tool_calls: accum.tool_calls, error: accum.error, cancelled: false, emitted }
}

fn req(model: &str) -> Value {
    json!({ "model": model, "messages": [{"role":"user","content":"hi"}], "stream": true })
}

async fn run(server: &FakeServer, model: &str) -> Outcome {
    let (_tx, mut rx) = oneshot::channel();
    stream_chat(&server.url("/v1/chat/completions"), req(model), &mut rx).await
}

// ── Healthy path ─────────────────────────────────────────────────────────────────

server_test!(normal_stream_completes, 8301, server, {
    let out = run(&server, "ok/stream").await;
    assert_eq!(out.content, "Local models stream one token at a time.");
    assert!(out.error.is_none());
    assert_eq!(out.emitted.len(), 9, "each token should reach the UI as its own delta");
});

server_test!(multibyte_survives_real_socket_chunking, 8302, server, {
    let out = run(&server, "ok/unicode-split").await;
    assert_eq!(out.content, "äöü — 日本語 🎹 done");
    assert!(!out.content.contains('\u{FFFD}'));
});

server_test!(crlf_stream_parses, 8303, server, {
    let out = run(&server, "ok/crlf").await;
    assert_eq!(out.content, "Local models stream one token at a time.");
});

server_test!(keepalive_comments_are_ignored, 8304, server, {
    let out = run(&server, "ok/comments").await;
    assert_eq!(out.content, "Hello world");
    assert!(out.error.is_none());
});

// ── Server lifecycle ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn server_not_running_is_a_connection_error() {
    // Nothing is listening on this port. This is the "LM Studio was never started" case.
    let (_tx, mut rx) = oneshot::channel();
    let out = stream_chat("http://127.0.0.1:8399/v1/chat/completions", req("ok/stream"), &mut rx).await;
    assert!(out.error.is_some(), "a refused connection must surface as an error");
    assert!(out.content.is_empty());
}

server_test!(server_stopped_between_requests, 8305, server, {
    let first = run(&server, "ok/stream").await;
    assert!(first.error.is_none());

    // `offline` makes /v1/* refuse the way a stopped server does, while the process stays
    // up — the app must recover on the next request rather than latching into a bad state.
    let client = reqwest::Client::new();
    client.post(server.url("/__control")).json(&json!({"offline": true})).send().await.unwrap();

    let during = run(&server, "ok/stream").await;
    assert!(during.error.is_some(), "requests must fail while the server is down");

    client.post(server.url("/__control")).json(&json!({"offline": false})).send().await.unwrap();

    let after = run(&server, "ok/stream").await;
    assert!(after.error.is_none(), "the next request after a restart must succeed");
    assert_eq!(after.content, "Local models stream one token at a time.");
});

server_test!(model_list_reflects_what_is_loaded, 8306, server, {
    let client = reqwest::Client::new();

    let all: Value = client.get(server.url("/v1/models")).send().await.unwrap().json().await.unwrap();
    assert!(all["data"].as_array().unwrap().len() > 20);

    // Unload everything but one model — the switching case.
    client.post(server.url("/__control")).json(&json!({"models": ["ok/stream"]})).send().await.unwrap();
    let one: Value = client.get(server.url("/v1/models")).send().await.unwrap().json().await.unwrap();
    assert_eq!(one["data"].as_array().unwrap().len(), 1);

    // A request for a model that is no longer loaded must fail loudly, not silently.
    let out = run(&server, "ok/comments").await;
    assert!(out.error.as_deref().unwrap_or("").contains("not loaded"));
});

server_test!(unknown_model_is_rejected, 8307, server, {
    let out = run(&server, "no/such/model").await;
    let err = out.error.expect("unknown model must error");
    assert!(err.contains("404"), "got: {err}");
});

// ── Streaming interruption ───────────────────────────────────────────────────────

server_test!(socket_dropped_midstream_keeps_partial_text, 8308, server, {
    let out = run(&server, "abort/midstream").await;
    assert_eq!(
        out.content, "This answer was cut off mid-",
        "text that already reached the user must survive the drop"
    );
    assert!(out.error.is_some(), "a dropped socket is still an error");
    assert!(out.partial(), "the frontend needs to know this is partial output");
});

server_test!(stall_after_content_keeps_partial_text, 8309, server, {
    let out = run(&server, "stall/after-content").await;
    assert_eq!(out.content, "Starting to answer and then the server");
    assert_eq!(out.error.as_deref(), Some("Stream stalled"));
    assert!(out.partial());
});

server_test!(no_response_headers_times_out, 8310, server, {
    let out = run(&server, "hang/no-headers").await;
    assert!(out.error.is_some());
    assert!(out.content.is_empty());
});

server_test!(abort_before_any_data_yields_no_content, 8311, server, {
    let out = run(&server, "abort/immediate").await;
    assert!(out.content.is_empty());
    assert!(!out.partial(), "nothing arrived, so there is nothing partial to keep");
});

// ── Cancellation ─────────────────────────────────────────────────────────────────

server_test!(cancel_midstream_keeps_what_arrived, 8312, server, {
    let (tx, mut rx) = oneshot::channel();
    // slow/drip emits a token every 300 ms; cancel after ~1 s so some have landed.
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        let _ = tx.send(());
    });
    let out = stream_chat(&server.url("/v1/chat/completions"), req("slow/drip"), &mut rx).await;
    assert!(out.cancelled, "the request must report as cancelled");
    assert!(!out.content.is_empty(), "tokens that already arrived must be returned, not discarded");
    assert!(out.partial());
    assert!(out.content.starts_with("tok0 "), "got: {:?}", out.content);
});

server_test!(cancel_before_headers_returns_immediately, 8313, server, {
    let (tx, mut rx) = oneshot::channel();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = tx.send(());
    });
    let started = std::time::Instant::now();
    let out = stream_chat(&server.url("/v1/chat/completions"), req("slow/ttfb"), &mut rx).await;
    assert!(out.cancelled);
    assert!(
        started.elapsed() < Duration::from_secs(3),
        "cancel must not wait out the server's 5s time-to-first-byte"
    );
});

// ── Errors inside a 200 stream ───────────────────────────────────────────────────

server_test!(error_object_midstream_is_surfaced, 8314, server, {
    // The regression: an error object used to fall through the parser, the stream ended,
    // and a truncated answer was returned — and saved — as a completed reply.
    let out = run(&server, "sse/error-object").await;
    assert_eq!(
        out.error.as_deref(),
        Some("CUDA out of memory (server_error)"),
        "an error object inside a 200 stream must not read as success"
    );
    assert_eq!(out.content, "Partial answer before the GPU ran out");
});

server_test!(error_string_midstream_is_surfaced, 8315, server, {
    let out = run(&server, "sse/error-string").await;
    assert_eq!(out.error.as_deref(), Some("model unloaded during generation"));
    assert_eq!(out.content, "Partial answer");
});

server_test!(error_with_no_content_is_still_an_error, 8316, server, {
    let out = run(&server, "sse/error-nested-only").await;
    assert!(out.error.is_some());
    assert!(out.content.is_empty());
});

// ── HTTP-level failures ──────────────────────────────────────────────────────────

server_test!(http_errors_carry_the_server_message, 8317, server, {
    for (model, needle) in [
        ("http/500", "Internal server error"),
        ("http/401", "Invalid API key"),
        ("http/404-model", "not found"),
        ("http/503-loading", "Model is loading"),
    ] {
        let out = run(&server, model).await;
        let err = out.error.unwrap_or_default();
        assert!(err.contains(needle), "{model}: expected {needle:?} in {err:?}");
    }
});

server_test!(context_overflow_message_reaches_the_user, 8318, server, {
    let out = run(&server, "http/400-context").await;
    let err = out.error.expect("oversized context must error");
    assert!(err.contains("context length"), "the user has to be told it was the context: {err}");
});

server_test!(html_error_body_does_not_panic, 8319, server, {
    let out = run(&server, "http/html-error").await;
    assert!(out.error.is_some());
});

// ── Malformed payloads ───────────────────────────────────────────────────────────

server_test!(malformed_lines_do_not_abort_the_stream, 8320, server, {
    let out = run(&server, "malformed/bad-json").await;
    assert_eq!(out.content, "before after");
    assert!(out.error.is_none());
});

server_test!(missing_and_null_fields_are_tolerated, 8321, server, {
    assert_eq!(run(&server, "malformed/no-choices").await.content, "ab");
    assert_eq!(run(&server, "malformed/null-content").await.content, "only this is real");
});

server_test!(stream_without_done_still_completes, 8322, server, {
    let out = run(&server, "malformed/no-done").await;
    assert_eq!(out.content, "Local models stream one token at a time.");
    assert!(out.error.is_none(), "a clean EOF without [DONE] is not an error");
});

server_test!(dangling_final_line_is_dropped, 8323, server, {
    let out = run(&server, "malformed/no-trailing-newline").await;
    assert_eq!(out.content, "complete line", "half a JSON object must not be acted on");
});

server_test!(giant_single_line_reassembles, 8324, server, {
    let out = run(&server, "malformed/giant-line").await;
    assert_eq!(out.content.len(), 400_000);
});

server_test!(empty_stream_yields_empty_content, 8325, server, {
    let out = run(&server, "ok/empty-content").await;
    assert!(out.content.is_empty());
    assert!(out.error.is_none());
});

// ── Tool calls over the wire ─────────────────────────────────────────────────────

server_test!(tool_arguments_reassemble_off_the_socket, 8326, server, {
    let out = run(&server, "tools/split-args").await;
    assert_eq!(out.tool_calls.len(), 1);
    let args = out.tool_calls[0]["function"]["arguments"].as_str().unwrap();
    let parsed: Value = serde_json::from_str(args).expect("must be valid JSON once reassembled");
    assert_eq!(parsed["query"], "tauri error handling");
    assert_eq!(parsed["limit"], 8);
    assert!(out.emitted.is_empty(), "tool fragments must not render as answer text");
});

server_test!(parallel_tool_calls_stay_separate_off_the_socket, 8327, server, {
    let out = run(&server, "tools/two-parallel").await;
    assert_eq!(out.tool_calls.len(), 2);
    assert_eq!(out.tool_calls[0]["function"]["arguments"], "{\"query\":\"alpha\"}");
    assert_eq!(out.tool_calls[1]["function"]["arguments"], "{\"query\":\"beta\"}");
});

server_test!(tool_call_without_index_still_lands, 8328, server, {
    let out = run(&server, "tools/no-index").await;
    assert_eq!(out.tool_calls.len(), 1);
    assert_eq!(out.tool_calls[0]["function"]["name"], "concept_search");
});

server_test!(text_and_tool_call_in_one_stream, 8329, server, {
    let out = run(&server, "tools/then-text").await;
    assert_eq!(out.content, "Let me look that up. ");
    assert_eq!(out.tool_calls.len(), 1);
});

// ── Concurrency ──────────────────────────────────────────────────────────────────

server_test!(concurrent_streams_do_not_interleave, 8330, server, {
    // Two chats streaming at once must each get their own text. If any shared buffer or
    // shared cancel slot existed, this is where it would show.
    let a = async {
        let (_tx, mut rx) = oneshot::channel();
        stream_chat(&server.url("/v1/chat/completions"), req("ok/stream"), &mut rx).await
    };
    let b = async {
        let (_tx, mut rx) = oneshot::channel();
        stream_chat(&server.url("/v1/chat/completions"), req("ok/comments"), &mut rx).await
    };
    let (ra, rb) = tokio::join!(a, b);
    assert_eq!(ra.content, "Local models stream one token at a time.");
    assert_eq!(rb.content, "Hello world");
});

server_test!(cancelling_one_stream_leaves_the_other_running, 8331, server, {
    // The behaviour chat_cancel's per-generation keying exists to provide: cancelling one
    // in-flight generation must not touch another.
    let (tx_a, mut rx_a) = oneshot::channel();
    let (_tx_b, mut rx_b) = oneshot::channel();
    let url = server.url("/v1/chat/completions");

    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(700)).await;
        let _ = tx_a.send(());
    });

    let a = stream_chat(&url, req("slow/drip"), &mut rx_a);
    let b = stream_chat(&url, req("ok/stream"), &mut rx_b);
    let (ra, rb) = tokio::join!(a, b);

    assert!(ra.cancelled, "the cancelled stream must report cancelled");
    assert!(!rb.cancelled, "the other stream must be untouched");
    assert_eq!(rb.content, "Local models stream one token at a time.");
});

// ── Reasoning fallback ───────────────────────────────────────────────────────────

server_test!(reasoning_rejection_then_retry_succeeds, 8332, server, {
    let url = server.url("/v1/chat/completions");

    // With the reasoning hints present the server rejects, exactly as some do.
    let mut with_reasoning = req("reasoning/reject");
    with_reasoning["reasoning_effort"] = json!("medium");
    with_reasoning["enable_thinking"] = json!(true);
    let (_tx, mut rx) = oneshot::channel();
    let rejected = stream_chat(&url, with_reasoning, &mut rx).await;
    assert!(rejected.error.is_some(), "reasoning hints must be rejected by this scenario");

    // post_stream's fallback strips them and retries; that retry must succeed.
    let (_tx2, mut rx2) = oneshot::channel();
    let retried = stream_chat(&url, req("reasoning/reject"), &mut rx2).await;
    assert!(retried.error.is_none());
    assert_eq!(retried.content, "Answered after the reasoning fallback.");
});

server_test!(reasoning_only_reply_has_no_content, 8333, server, {
    // The empty-reply case the UI explains to the user: the budget went on thinking.
    let out = run(&server, "reasoning/only-thinking").await;
    assert!(out.content.is_empty(), "reasoning_content must not be treated as answer text");
    assert!(out.error.is_none());
});

// ── What the app actually sends ──────────────────────────────────────────────────

server_test!(request_shape_reaches_the_server_intact, 8334, server, {
    let url = server.url("/v1/chat/completions");
    let body = json!({
        "model": "echo/request",
        "stream": true,
        "temperature": 0.4,
        "max_tokens": 1234,
        "messages": [
            {"role": "system", "content": "preamble"},
            {"role": "user", "content": "question"}
        ],
        "tools": [{"type":"function","function":{"name":"concept_search"}}]
    });
    let (_tx, mut rx) = oneshot::channel();
    let out = stream_chat(&url, body, &mut rx).await;
    let echoed: Value = serde_json::from_str(&out.content).expect("echo scenario returns JSON");
    assert_eq!(echoed["roles"], json!(["system", "user"]));
    assert_eq!(echoed["temperature"], 0.4);
    assert_eq!(echoed["max_tokens"], 1234);
    assert_eq!(echoed["hasTools"], true);
    assert_eq!(echoed["toolNames"], json!(["concept_search"]));
});
