//! SSE accumulation for OpenAI-compatible `chat/completions` streams.
//!
//! This is the half of `post_stream` that has no network and no Tauri in it: bytes in,
//! answer text and tool calls out. It lives here so it can be tested directly against the
//! byte sequences a server only produces when something has gone wrong — an error object
//! arriving mid-stream, a chunk boundary through the middle of a multi-byte character,
//! tool-call arguments split so they only parse once reassembled. Those cases were
//! previously unreachable from any test: `tools/fake-server.mjs` can now produce them and
//! the tests at the bottom of this file assert what the parser does with them.

use serde_json::{json, Value};

/// Everything a stream has produced so far.
#[derive(Default, Debug)]
pub struct StreamAccum {
    pub content: String,
    pub tool_calls: Vec<Value>,
    pub chunk_count: u64,
    /// Set once the stream carries an error event. The caller stops feeding lines when
    /// this becomes `Some`, but keeps whatever `content` already arrived.
    pub error: Option<String>,
}

impl StreamAccum {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed one raw line from the stream. Returns the answer-text delta it carried, if any,
    /// so the caller can forward it to the UI. Lines that are blank, comments, `event:`
    /// fields, the `[DONE]` sentinel, or unparseable are skipped — a malformed line must
    /// never abort a stream that is otherwise fine.
    pub fn apply_line(&mut self, line: &str) -> Option<String> {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') || trimmed.starts_with("event:") {
            return None;
        }
        // Accept both `data: {...}` and `data:{...}`. The spec makes the space optional and
        // some OpenAI-compatible local servers omit it; requiring it dropped their entire
        // stream silently, which looked like an empty reply rather than a parse failure.
        let payload = if let Some(rest) = trimmed.strip_prefix("data:") {
            rest.trim_start()
        } else {
            return None;
        };
        if payload == "[DONE]" {
            return None;
        }
        let Ok(event) = serde_json::from_str::<Value>(payload) else {
            return None;
        };

        if let Some(msg) = sse_error_message(&event) {
            self.error = Some(msg);
            return None;
        }

        self.apply_tool_call_deltas(&event);

        // Only a string delta is answer text. A null/number/absent `content` is normal
        // filler in streams that are carrying reasoning or tool calls instead.
        let delta = event
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())?;
        self.content.push_str(delta);
        self.chunk_count += 1;
        Some(delta.to_string())
    }

    /// Tool calls arrive split across chunks: the id and function name appear once, the
    /// arguments accumulate as JSON fragments, and `index` says which call each fragment
    /// belongs to. Reassemble per index rather than assuming one call, and never forward
    /// any of it as answer text.
    fn apply_tool_call_deltas(&mut self, event: &Value) {
        let Some(deltas) = event
            .pointer("/choices/0/delta/tool_calls")
            .and_then(Value::as_array)
        else {
            return;
        };
        for d in deltas {
            let idx = d.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            while self.tool_calls.len() <= idx {
                self.tool_calls.push(json!({
                    "id": "", "type": "function",
                    "function": { "name": "", "arguments": "" }
                }));
            }
            let slot = &mut self.tool_calls[idx];
            if let Some(id) = d.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                slot["id"] = json!(id);
            }
            if let Some(name) = d
                .pointer("/function/name")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                slot["function"]["name"] = json!(name);
            }
            if let Some(args) = d.pointer("/function/arguments").and_then(Value::as_str) {
                let joined = format!(
                    "{}{}",
                    slot["function"]["arguments"].as_str().unwrap_or(""),
                    args
                );
                slot["function"]["arguments"] = json!(joined);
            }
        }
    }
}

/// Pull an error message out of an SSE event.
///
/// The shape is not consistent across servers, and reading only one of them is how a failed
/// generation used to look like a successful short one. `{"error": {"message", "type", ...}}`
/// is the OpenAI-compatible error object — what a server emits inside an already-200 stream
/// when generation dies partway (VRAM exhaustion, a model unloaded underneath the request) —
/// while some proxies emit a bare string instead. Only the string form was read, so the
/// object form fell through the parser, the stream ended normally, and the truncated answer
/// was returned — and saved — as though the model had finished.
///
/// Not observed against a live LM Studio failure (that needs a real OOM to reproduce); found
/// by reading the parser and covered by `tools/fake-server.mjs`'s `sse/error-object`.
pub fn sse_error_message(event: &Value) -> Option<String> {
    let err = event.get("error")?;
    match err {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Object(_) => {
            let msg = err
                .get("message")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty());
            match msg {
                Some(m) => match err.get("type").and_then(Value::as_str) {
                    Some(t) if !t.is_empty() => Some(format!("{m} ({t})")),
                    _ => Some(m.to_string()),
                },
                // An object with no usable message still means failure; surfacing the raw
                // JSON beats reporting success.
                None => Some(err.to_string()),
            }
        }
        _ => None,
    }
}

/// Split the complete lines off the front of a byte buffer, leaving any trailing partial
/// line behind.
///
/// Decoding is deferred to whole lines on purpose: network chunk boundaries are not
/// guaranteed to land on UTF-8 character boundaries, so decoding each chunk as it arrives
/// can split a multi-byte character into replacement-character garbage. `\n` (0x0A) never
/// appears inside a multi-byte UTF-8 sequence, so splitting on raw bytes here is safe, and
/// the remainder — which may end mid-character — stays buffered until the rest arrives.
pub fn take_complete_lines(buffer: &mut Vec<u8>) -> Option<String> {
    let split_at = buffer.iter().rposition(|&b| b == b'\n').map(|i| i + 1)?;
    let complete: Vec<u8> = buffer.drain(..split_at).collect();
    Some(String::from_utf8_lossy(&complete).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Feed a whole stream body through the parser the way `post_stream` does, in byte
    /// chunks of the given size, so chunk boundaries fall wherever the test wants them.
    fn run(body: &str, chunk_size: usize) -> (StreamAccum, Vec<String>) {
        let mut accum = StreamAccum::new();
        let mut emitted = Vec::new();
        let mut buffer: Vec<u8> = Vec::new();
        let bytes = body.as_bytes();
        for chunk in bytes.chunks(chunk_size.max(1)) {
            buffer.extend_from_slice(chunk);
            let Some(text) = take_complete_lines(&mut buffer) else {
                continue;
            };
            for line in text.split('\n') {
                if let Some(d) = accum.apply_line(line) {
                    emitted.push(d);
                }
                if accum.error.is_some() {
                    return (accum, emitted);
                }
            }
        }
        (accum, emitted)
    }

    fn delta(text: &str) -> String {
        format!(
            "data: {}\n\n",
            json!({"choices":[{"index":0,"delta":{"content":text},"finish_reason":null}]})
        )
    }

    // ── Healthy streams ──────────────────────────────────────────────────────────

    #[test]
    fn accumulates_content_in_order() {
        let body = format!("{}{}{}data: [DONE]\n\n", delta("Local "), delta("models "), delta("stream."));
        let (accum, emitted) = run(&body, 4096);
        assert_eq!(accum.content, "Local models stream.");
        assert_eq!(emitted, vec!["Local ", "models ", "stream."]);
        assert_eq!(accum.chunk_count, 3);
        assert!(accum.error.is_none());
    }

    #[test]
    fn multibyte_split_across_chunks_survives() {
        // One byte at a time is the worst case: every multi-byte character is split.
        let body = format!("{}data: [DONE]\n\n", delta("äöü — 日本語 🎹"));
        let (accum, _) = run(&body, 1);
        assert_eq!(accum.content, "äöü — 日本語 🎹");
        assert!(!accum.content.contains('\u{FFFD}'), "replacement char = a split character was decoded early");
    }

    #[test]
    fn same_result_at_every_chunk_size() {
        let body = format!("{}{}data: [DONE]\n\n", delta("Hello "), delta("wörld 🎹"));
        let expected = "Hello wörld 🎹";
        for size in [1, 2, 3, 5, 7, 13, 64, 512, 100_000] {
            let (accum, _) = run(&body, size);
            assert_eq!(accum.content, expected, "chunk size {size}");
        }
    }

    #[test]
    fn crlf_line_endings_parse() {
        let body = delta("Hello").replace('\n', "\r\n") + "data: [DONE]\r\n\r\n";
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "Hello");
    }

    #[test]
    fn comments_and_event_lines_are_skipped() {
        let body = format!(": keep-alive\n\n{}event: ping\ndata: {{\"noise\":true}}\n\n{}", delta("a"), delta("b"));
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "ab");
        assert!(accum.error.is_none());
    }

    #[test]
    fn data_without_space_after_colon_parses() {
        // Some OpenAI-compatible servers omit the space. Requiring it dropped the whole
        // stream and looked like an empty reply.
        let body = format!(
            "data:{}\n\n",
            json!({"choices":[{"index":0,"delta":{"content":"no space"}}]})
        );
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "no space");
    }

    // ── Malformed payloads must not abort an otherwise-fine stream ───────────────

    #[test]
    fn unparseable_line_is_skipped_not_fatal() {
        let body = format!("{}data: {{\"choices\":[{{\"delta\":\n\n{}", delta("before"), delta(" after"));
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "before after");
        assert!(accum.error.is_none());
    }

    #[test]
    fn missing_choices_is_skipped() {
        let body = format!("{}data: {{\"id\":\"x\"}}\n\n{}", delta("a"), delta("b"));
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "ab");
    }

    #[test]
    fn non_string_content_is_ignored() {
        let body = format!(
            "data: {}\n\ndata: {}\n\ndata: {}\n\n{}",
            json!({"choices":[{"delta":{"content":Value::Null}}]}),
            json!({"choices":[{"delta":{"content":42}}]}),
            json!({"choices":[{"delta":{}}]}),
            delta("only this")
        );
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "only this");
        assert_eq!(accum.chunk_count, 1);
    }

    #[test]
    fn trailing_partial_line_is_not_emitted() {
        // A line with no terminating newline before EOF is incomplete; emitting it would
        // mean acting on half a JSON object.
        let body = format!("{}data: {{\"choices\":[{{\"delta\":{{\"content\":\"dangling\"", delta("complete"));
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.content, "complete");
    }

    #[test]
    fn empty_string_delta_does_not_count_as_a_chunk() {
        let body = format!("data: {}\n\n{}", json!({"choices":[{"delta":{"content":""}}]}), delta("x"));
        let (accum, emitted) = run(&body, 4096);
        assert_eq!(accum.chunk_count, 1);
        assert_eq!(emitted, vec!["x"]);
    }

    // ── Errors delivered inside a 200 stream ────────────────────────────────────

    #[test]
    fn error_object_mid_stream_is_reported_and_keeps_partial_content() {
        // The regression this file exists for: only the string form used to be read, so an
        // object error fell through, the stream ended, and a truncated answer was returned
        // as a success and written to the transcript.
        let body = format!(
            "{}{}data: {}\n\n",
            delta("Partial answer before"),
            delta(" the GPU ran out"),
            json!({"error":{"message":"CUDA out of memory","type":"server_error","code":500}})
        );
        let (accum, _) = run(&body, 4096);
        assert_eq!(
            accum.error.as_deref(),
            Some("CUDA out of memory (server_error)"),
            "an error object inside a 200 stream must be surfaced, not skipped"
        );
        assert_eq!(
            accum.content, "Partial answer before the GPU ran out",
            "text that already arrived is still real and must survive the error"
        );
    }

    #[test]
    fn error_string_mid_stream_is_reported() {
        let body = format!("{}data: {}\n\n", delta("Partial"), json!({"error":"model unloaded during generation"}));
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.error.as_deref(), Some("model unloaded during generation"));
        assert_eq!(accum.content, "Partial");
    }

    #[test]
    fn error_object_without_message_still_reports() {
        let ev = json!({"error":{"code":500}});
        assert!(sse_error_message(&ev).is_some(), "an unrecognised error object must not read as success");
    }

    #[test]
    fn error_message_alone_omits_the_type_suffix() {
        let ev = json!({"error":{"message":"plain"}});
        assert_eq!(sse_error_message(&ev).as_deref(), Some("plain"));
    }

    #[test]
    fn the_old_string_only_check_would_have_missed_an_error_object() {
        // Kept as a permanent record of the regression: the parser used to ask only
        // `event["error"].as_str()`, which is None for the object form every local server
        // actually emits. The error was skipped, the stream ended normally, and the
        // truncated answer was returned as a success — and written to the transcript.
        let ev = json!({"error":{"message":"CUDA out of memory","type":"server_error"}});
        assert!(
            ev.get("error").and_then(Value::as_str).is_none(),
            "as_str() on an error object is None — this is the miss"
        );
        assert!(sse_error_message(&ev).is_some(), "the object form must be caught now");
    }

    #[test]
    fn absent_or_null_error_is_not_an_error() {
        assert!(sse_error_message(&json!({"choices":[]})).is_none());
        assert!(sse_error_message(&json!({"error":Value::Null})).is_none());
        assert!(sse_error_message(&json!({"error":""})).is_none());
    }

    // ── Tool calls ──────────────────────────────────────────────────────────────

    #[test]
    fn tool_call_arguments_reassemble_across_chunks() {
        let frag = |f: Value| format!("data: {}\n\n", json!({"choices":[{"delta":{"tool_calls":[f]}}]}));
        let body = [
            frag(json!({"index":0,"id":"call_1","type":"function","function":{"name":"concept_search","arguments":""}})),
            frag(json!({"index":0,"function":{"arguments":"{\"qu"}})),
            frag(json!({"index":0,"function":{"arguments":"ery\":\"tau"}})),
            frag(json!({"index":0,"function":{"arguments":"ri\",\"limit\":8}"}})),
            "data: [DONE]\n\n".to_string(),
        ]
        .concat();
        let (accum, emitted) = run(&body, 4096);
        assert_eq!(accum.tool_calls.len(), 1);
        assert_eq!(accum.tool_calls[0]["function"]["name"], "concept_search");
        assert_eq!(accum.tool_calls[0]["id"], "call_1");
        let args = accum.tool_calls[0]["function"]["arguments"].as_str().unwrap();
        let parsed: Value = serde_json::from_str(args).expect("reassembled arguments must be valid JSON");
        assert_eq!(parsed["query"], "tauri");
        assert_eq!(parsed["limit"], 8);
        assert!(emitted.is_empty(), "tool-call fragments must never reach the UI as answer text");
        assert_eq!(accum.content, "");
    }

    #[test]
    fn parallel_tool_calls_stay_separate() {
        let frag = |f: Value| format!("data: {}\n\n", json!({"choices":[{"delta":{"tool_calls":[f]}}]}));
        let body = [
            frag(json!({"index":0,"id":"call_a","type":"function","function":{"name":"concept_search","arguments":""}})),
            frag(json!({"index":1,"id":"call_b","type":"function","function":{"name":"concept_search","arguments":""}})),
            frag(json!({"index":0,"function":{"arguments":"{\"query\":\"al"}})),
            frag(json!({"index":1,"function":{"arguments":"{\"query\":\"be"}})),
            frag(json!({"index":0,"function":{"arguments":"pha\"}"}})),
            frag(json!({"index":1,"function":{"arguments":"ta\"}"}})),
        ]
        .concat();
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.tool_calls.len(), 2);
        assert_eq!(accum.tool_calls[0]["id"], "call_a");
        assert_eq!(accum.tool_calls[1]["id"], "call_b");
        assert_eq!(accum.tool_calls[0]["function"]["arguments"], "{\"query\":\"alpha\"}");
        assert_eq!(accum.tool_calls[1]["function"]["arguments"], "{\"query\":\"beta\"}");
    }

    #[test]
    fn tool_call_deltas_without_index_target_slot_zero() {
        let frag = |f: Value| format!("data: {}\n\n", json!({"choices":[{"delta":{"tool_calls":[f]}}]}));
        let body = [
            frag(json!({"id":"call_z","type":"function","function":{"name":"concept_search","arguments":""}})),
            frag(json!({"function":{"arguments":"{\"query\":\"x\"}"}})),
        ]
        .concat();
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.tool_calls.len(), 1);
        assert_eq!(accum.tool_calls[0]["function"]["arguments"], "{\"query\":\"x\"}");
    }

    #[test]
    fn tool_calls_and_text_coexist() {
        let frag = format!(
            "data: {}\n\n",
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_t","type":"function","function":{"name":"concept_search","arguments":"{\"query\":\"k\"}"}}]}}]})
        );
        let body = format!("{}{}", delta("Let me look that up. "), frag);
        let (accum, emitted) = run(&body, 4096);
        assert_eq!(accum.content, "Let me look that up. ");
        assert_eq!(emitted, vec!["Let me look that up. "]);
        assert_eq!(accum.tool_calls.len(), 1);
    }

    #[test]
    fn malformed_tool_arguments_are_returned_verbatim() {
        // The parser's job is reassembly, not validation — the JS tool loop turns a bad
        // argument string into an error tool result rather than throwing.
        let body = format!(
            "data: {}\n\n",
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"m","type":"function","function":{"name":"concept_search","arguments":"{\"query\": "}}]}}]})
        );
        let (accum, _) = run(&body, 4096);
        assert_eq!(accum.tool_calls[0]["function"]["arguments"], "{\"query\": ");
    }

    // ── Buffer mechanics ────────────────────────────────────────────────────────

    #[test]
    fn take_complete_lines_leaves_the_partial_tail() {
        let mut buf = b"data: one\ndata: two\ndata: par".to_vec();
        let text = take_complete_lines(&mut buf).unwrap();
        assert_eq!(text, "data: one\ndata: two\n");
        assert_eq!(buf, b"data: par");
    }

    #[test]
    fn take_complete_lines_returns_none_without_a_newline() {
        let mut buf = b"data: partial".to_vec();
        assert!(take_complete_lines(&mut buf).is_none());
        assert_eq!(buf, b"data: partial", "buffer must be left intact");
    }

    #[test]
    fn a_line_larger_than_many_chunks_reassembles() {
        let big = "x".repeat(400_000);
        let body = format!("{}data: [DONE]\n\n", delta(&big));
        let (accum, _) = run(&body, 1024);
        assert_eq!(accum.content.len(), 400_000);
    }
}
