use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, WebviewWindow};
use tokio::sync::oneshot;

const DEFAULT_SERVER_URL: &str = "http://localhost:1234";
const CONNECT_TIMEOUT_SECS: u64 = 30;
const STALL_TIMEOUT_SECS: u64 = 120;

#[derive(Default)]
struct AppState {
    current_cancel: Mutex<Option<oneshot::Sender<()>>>,
    server_url: Mutex<String>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}

fn generate_chat_id() -> String {
    format!(
        "{}{}",
        radix36(now_ms() as u64),
        &radix36(randish()).chars().take(5).collect::<String>()
    )
}

fn randish() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    (nanos as u64) ^ ((nanos >> 64) as u64) ^ std::process::id() as u64
}

fn radix36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        let d = (n % 36) as u8;
        out.push(if d < 10 { b'0' + d } else { b'a' + d - 10 } as char);
        n /= 36;
    }
    out.iter().rev().collect()
}

fn app_root(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .or_else(|_| app.path().resource_dir())
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn chats_dir(app: &AppHandle) -> PathBuf {
    app_root(app).join("chats")
}

fn data_dir(app: &AppHandle) -> PathBuf {
    app_root(app).join("data")
}

fn chat_meta_dir(app: &AppHandle) -> PathBuf {
    data_dir(app).join("chat-meta")
}

fn private_dir(app: &AppHandle) -> PathBuf {
    chats_dir(app).join("private")
}

fn server_url_file(app: &AppHandle) -> PathBuf {
    app_root(app).join("server-url.txt")
}

fn load_server_url_from_file(app: &AppHandle) -> String {
    fs::read_to_string(server_url_file(app))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_SERVER_URL.to_string())
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Failed to create directory: {e}"))
}

fn is_yyyy_mm_dir_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 7
        && bytes[4] == b'-'
        && bytes[0..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
}

fn is_mm_dir_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 2 && bytes.iter().all(u8::is_ascii_digit)
}

fn is_year_dir_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 4 && bytes.iter().all(u8::is_ascii_digit)
}

fn month_from_iso(value: &str) -> String {
    if value.len() >= 7 && is_yyyy_mm_dir_name(&value[..7]) {
        format!("{}/{}", &value[..4], &value[5..7])
    } else if value.len() >= 7
        && is_year_dir_name(&value[..4])
        && &value[4..5] == "/"
        && is_mm_dir_name(&value[5..7])
    {
        value[..7].to_string()
    } else if value.len() >= 7
        && is_mm_dir_name(&value[..2])
        && &value[2..3] == "/"
        && is_year_dir_name(&value[3..7])
    {
        format!("{}/{}", &value[3..7], &value[..2])
    } else {
        "unknown".to_string()
    }
}

fn month_from_chat(chat: &Value) -> String {
    chat.get("created")
        .and_then(Value::as_str)
        .map(month_from_iso)
        .unwrap_or_else(|| "unknown".to_string())
}

fn monthly_dir(root: &Path, month: &str) -> PathBuf {
    let normalized = month_from_iso(month);
    if normalized == "unknown" {
        return root.join("unknown");
    }
    let mut parts = normalized.split('/');
    let yyyy = parts.next().unwrap_or("unknown");
    let mm = parts.next().unwrap_or("unknown");
    root.join(yyyy).join(mm)
}

fn chat_file_name(chat_id: &str) -> String {
    format!("{chat_id}.txt")
}

fn list_chat_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("txt") {
                files.push(path);
            } else if path.is_dir() {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or_default();
                if name == "private" {
                    continue;
                }
                if is_yyyy_mm_dir_name(name) || name == "unknown" {
                    if let Ok(month_entries) = fs::read_dir(path) {
                        for month_entry in month_entries.flatten() {
                            let month_path = month_entry.path();
                            if month_path.extension().and_then(|s| s.to_str()) == Some("txt") {
                                files.push(month_path);
                            }
                        }
                    }
                } else if is_year_dir_name(name) {
                    if let Ok(month_entries) = fs::read_dir(path) {
                        for month_entry in month_entries.flatten() {
                            let month_path = month_entry.path();
                            let month_name = month_path
                                .file_name()
                                .and_then(|s| s.to_str())
                                .unwrap_or_default();
                            if !month_path.is_dir() || !is_mm_dir_name(month_name) {
                                continue;
                            }
                            if let Ok(chat_entries) = fs::read_dir(month_path) {
                                for chat_entry in chat_entries.flatten() {
                                    let chat_path = chat_entry.path();
                                    if chat_path.extension().and_then(|s| s.to_str())
                                        == Some("txt")
                                    {
                                        files.push(chat_path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

fn find_chat_file_in(root: &Path, chat_id: &str) -> Option<PathBuf> {
    let filename = chat_file_name(chat_id);
    let legacy = root.join(&filename);
    if legacy.exists() {
        return Some(legacy);
    }
    for file in list_chat_files(root) {
        if file.file_name().and_then(|s| s.to_str()) == Some(filename.as_str()) {
            return Some(file);
        }
    }
    None
}

fn find_chat_file(app: &AppHandle, chat_id: &str) -> Option<PathBuf> {
    find_chat_file_in(&chats_dir(app), chat_id)
        .or_else(|| find_chat_file_in(&private_dir(app), chat_id))
}

fn resolve_chat_dir(app: &AppHandle, chat_id: &str, month: Option<&str>) -> PathBuf {
    if let Some(path) = find_chat_file(app, chat_id) {
        return path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
    }
    monthly_dir(&chats_dir(app), month.unwrap_or("unknown"))
}

fn get_text_content(msg: &Value) -> String {
    match msg.get("content") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| {
                (p.get("type").and_then(Value::as_str) == Some("text")).then(|| {
                    p.get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string()
                })
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn chat_to_text(chat: &Value) -> String {
    let title = chat.get("title").and_then(Value::as_str).unwrap_or_default();
    let created = chat
        .get("created")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let model = chat
        .get("model")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("local");
    let mut text = format!("Title: {title}\nDate: {created}\nModel: {model}\n");
    if let Some(group) = chat
        .get("branchGroup")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        text.push_str(&format!("Branch-Group: {group}\n"));
    }
    text.push_str("\n---\n");

    if let Some(messages) = chat.get("messages").and_then(Value::as_array) {
        for msg in messages {
            let role = msg.get("role").and_then(Value::as_str).unwrap_or_default();
            let label = if role == "user" { "You" } else { "Assistant" };
            text.push_str(&format!("\n[{label}]\n"));
            text.push_str(&get_text_content(msg));
            text.push('\n');
        }
    }
    text
}

fn text_to_chat(text: &str, filename: &str) -> Value {
    let lines: Vec<&str> = text.split('\n').collect();
    let chat_id = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    let mut title = String::new();
    let mut created = String::new();
    let mut model = String::new();
    let mut branch_group = String::new();
    let mut i = 0usize;

    while i < lines.len() {
        let line = lines[i];
        if let Some(v) = line.strip_prefix("Title: ") {
            title = v.to_string();
        } else if let Some(v) = line.strip_prefix("Date: ") {
            created = v.to_string();
        } else if let Some(v) = line.strip_prefix("Model: ") {
            model = v.to_string();
        } else if let Some(v) = line.strip_prefix("Branch-Group: ") {
            branch_group = v.to_string();
        } else if line.trim() == "---" {
            i += 1;
            break;
        }
        i += 1;
    }

    let mut messages = Vec::<Value>::new();
    let mut current_role: Option<String> = None;
    let mut current_content = Vec::<String>::new();

    let push_msg = |msgs: &mut Vec<Value>,
                        role: &mut Option<String>,
                        content: &mut Vec<String>| {
        if let Some(r) = role.clone() {
            let text = content.join("\n").trim().to_string();
            msgs.push(json!({ "role": r, "content": text }));
        }
        *role = None;
        content.clear();
    };

    while i < lines.len() {
        let line = lines[i];
        if line == "[You]" {
            push_msg(&mut messages, &mut current_role, &mut current_content);
            current_role = Some("user".to_string());
        } else if line == "[Assistant]" || line == "[Grok]" {
            push_msg(&mut messages, &mut current_role, &mut current_content);
            current_role = Some("assistant".to_string());
        } else {
            current_content.push(line.to_string());
        }
        i += 1;
    }
    push_msg(&mut messages, &mut current_role, &mut current_content);

    json!({
        "id": chat_id,
        "title": title,
        "created": created,
        "model": model,
        "branchGroup": branch_group,
        "messages": messages
    })
}

fn parse_header(text: &str, filename: &str) -> Value {
    let mut title = "";
    let mut created = "";
    let mut model = "";
    let mut branch_group = "";
    for line in text.lines() {
        if let Some(v) = line.strip_prefix("Title: ") {
            title = v;
        } else if let Some(v) = line.strip_prefix("Date: ") {
            created = v;
        } else if let Some(v) = line.strip_prefix("Model: ") {
            model = v;
        } else if let Some(v) = line.strip_prefix("Branch-Group: ") {
            branch_group = v;
        } else if line.trim() == "---" {
            break;
        }
    }
    json!({
        "id": Path::new(filename).file_stem().and_then(|s| s.to_str()).unwrap_or_default(),
        "title": title,
        "created": created,
        "model": model,
        "branchGroup": branch_group
    })
}

fn summarize_messages(messages: &Value) -> Value {
    let Some(items) = messages.as_array() else {
        return json!([]);
    };
    Value::Array(
        items
            .iter()
            .map(|m| {
                let role = m.get("role").cloned().unwrap_or(Value::String(String::new()));
                let content = match m.get("content") {
                    Some(Value::String(s)) => {
                        if s.len() > 120 {
                            format!("{}…", &s[..120])
                        } else {
                            s.clone()
                        }
                    }
                    _ => String::new(),
                };
                json!({ "role": role, "content": content })
            })
            .collect(),
    )
}

fn dev_log(window: &WebviewWindow, log_type: &str, mut data: Value) {
    if let Some(obj) = data.as_object_mut() {
        obj.insert(
            "id".into(),
            Value::String(format!(
                "{}{}",
                radix36(now_ms() as u64),
                radix36(randish())
            )),
        );
        obj.insert("timestamp".into(), json!(now_ms() as u64));
        obj.insert("type".into(), Value::String(log_type.to_string()));
    }
    let _ = window.emit("dev:log", data);
}

async fn post_stream(
    window: WebviewWindow,
    state: tauri::State<'_, AppState>,
    messages: Value,
    options: Option<Value>,
    stream_channel: Channel<String>,
) -> Value {
    let server_url = state.server_url.lock().unwrap().clone();
    let model = options
        .as_ref()
        .and_then(|o| o.get("model"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let endpoint = format!("{}/v1/chat/completions", server_url.trim_end_matches('/'));
    let start = now_ms();

    let (cancel_tx, mut cancel_rx) = oneshot::channel();
    if let Ok(mut current) = state.current_cancel.lock() {
        *current = Some(cancel_tx);
    }

    // Prepend system prompt if provided
    let mut effective = messages.clone();
    if let Some(sys) = options
        .as_ref()
        .and_then(|o| o.get("systemPrompt"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        if let Some(arr) = effective.as_array_mut() {
            arr.insert(0, json!({ "role": "system", "content": sys }));
        }
    }

    let mut body = json!({
        "model": model,
        "messages": effective,
        "stream": true
    });

    if let Some(v) = options.as_ref().and_then(|o| o.get("temperature")).cloned() {
        body["temperature"] = v;
    }
    if let Some(v) = options
        .as_ref()
        .and_then(|o| o.get("maxTokens"))
        .and_then(Value::as_u64)
        .filter(|&n| n > 0)
    {
        body["max_tokens"] = json!(v);
    }

    dev_log(
        &window,
        "request",
        json!({
            "endpoint": endpoint,
            "method": "POST",
            "model": model,
            "messageCount": effective.as_array().map(|a| a.len()).unwrap_or(0),
            "messages": summarize_messages(&effective),
            "streaming": true
        }),
    );

    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": e.to_string() }),
    };

    let request = client.post(&endpoint).json(&body).send();

    let response = tokio::select! {
        _ = &mut cancel_rx => {
            dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "cancelled" }));
            return json!({ "cancelled": true });
        }
        r = request => r
    };

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("Connection failed: {e}");
            dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
            return json!({ "error": msg });
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let msg = format!("Server error {status}: {body_text}");
        dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
        return json!({ "error": msg });
    }

    let mut stream = response.bytes_stream();
    let mut full_content = String::new();
    let mut buffer = String::new();
    let mut chunk_count = 0u64;
    let mut stream_error: Option<String> = None;

    loop {
        let next = tokio::select! {
            _ = &mut cancel_rx => {
                dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "chunkCount": chunk_count, "status": "cancelled" }));
                return json!({ "cancelled": true });
            }
            item = tokio::time::timeout(Duration::from_secs(STALL_TIMEOUT_SECS), stream.next()) => item,
        };

        let Some(item) = (match next {
            Ok(v) => v,
            Err(_) => {
                return json!({ "error": format!("Stream stalled — no data for {STALL_TIMEOUT_SECS}s") })
            }
        }) else {
            break;
        };

        let bytes = match item {
            Ok(b) => b,
            Err(e) => return json!({ "error": e.to_string() }),
        };

        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let mut lines: Vec<String> = buffer.split('\n').map(str::to_string).collect();
        buffer = lines.pop().unwrap_or_default();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("event:")
                || trimmed == "data: [DONE]"
                || !trimmed.starts_with("data: ")
            {
                continue;
            }
            let Ok(json_event) = serde_json::from_str::<Value>(&trimmed[6..]) else {
                continue;
            };

            if let Some(err_msg) = json_event.get("error").and_then(Value::as_str) {
                stream_error = Some(err_msg.to_string());
                break;
            }

            // Standard OpenAI chat/completions streaming format
            if let Some(delta) = json_event
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                full_content.push_str(delta);
                chunk_count += 1;
                let _ = stream_channel.send(delta.to_string());
            }
        }

        if stream_error.is_some() {
            break;
        }
    }

    if let Some(error) = stream_error {
        if let Ok(mut current) = state.current_cancel.lock() {
            *current = None;
        }
        return json!({ "error": error });
    }

    dev_log(
        &window,
        "response",
        json!({
            "endpoint": endpoint,
            "model": model,
            "durationMs": now_ms().saturating_sub(start),
            "contentLength": full_content.len(),
            "chunkCount": chunk_count,
            "status": "success"
        }),
    );

    if let Ok(mut current) = state.current_cancel.lock() {
        *current = None;
    }

    json!({ "content": full_content })
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn chat_send(
    window: WebviewWindow,
    state: tauri::State<'_, AppState>,
    messages: Value,
    options: Option<Value>,
    stream_channel: Channel<String>,
) -> Result<Value, String> {
    Ok(post_stream(window, state, messages, options, stream_channel).await)
}

#[tauri::command]
fn chat_cancel(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    if let Some(cancel) = state
        .current_cancel
        .lock()
        .map_err(|e| e.to_string())?
        .take()
    {
        let _ = cancel.send(());
    }
    Ok(json!({ "cancelled": true }))
}

#[tauri::command]
async fn get_models(server_url: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/v1/models", server_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Cannot reach server: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Server returned {}", resp.status()));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    // Normalize: extract [{id, contextLength}] from OpenAI-compatible response
    let models = data
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let id = m
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            // Try various field names for context length
            let ctx = m
                .pointer("/meta/n_context_train")
                .or_else(|| m.pointer("/meta/max_context_length"))
                .or_else(|| m.get("context_length"))
                .or_else(|| m.get("max_context_length"))
                .or_else(|| m.get("n_ctx"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            json!({ "id": id, "contextLength": ctx })
        })
        .collect::<Vec<_>>();
    Ok(json!({ "models": models }))
}

#[tauri::command]
fn get_server_url(state: tauri::State<'_, AppState>) -> Result<String, String> {
    Ok(state.server_url.lock().unwrap().clone())
}

#[tauri::command]
fn set_server_url(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<Value, String> {
    let url = url.trim().to_string();
    *state.server_url.lock().unwrap() = url.clone();
    fs::write(server_url_file(&app), &url).map_err(|e| format!("Failed to save URL: {e}"))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_save(app: AppHandle, mut chat: Value, base_count: Option<usize>) -> Result<Value, String> {
    let month = month_from_chat(&chat);
    let dir = monthly_dir(&chats_dir(&app), &month);
    ensure_dir(&dir)?;
    let old_id = chat
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let filename = chat_file_name(&old_id);
    let filepath = find_chat_file(&app, &old_id).unwrap_or_else(|| dir.join(&filename));
    let relocated = filepath.starts_with(private_dir(&app));
    if !filepath.exists() {
        let new_id = generate_chat_id();
        chat["id"] = Value::String(new_id.clone());
        let new_file = dir.join(chat_file_name(&new_id));
        fs::write(&new_file, chat_to_text(&chat)).map_err(|e| e.to_string())?;
        return Ok(json!({
            "ok": true,
            "newId": new_id,
            "savedCount": chat.pointer("/messages").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0)
        }));
    }
    if let Some(parent) = filepath.parent() {
        ensure_dir(parent)?;
    }
    let mut merged = false;
    if let Some(base_count) = base_count.filter(|c| *c > 0) {
        if let Ok(disk_text) = fs::read_to_string(&filepath) {
            let disk_chat = text_to_chat(&disk_text, &filename);
            let disk_len = disk_chat
                .pointer("/messages")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0);
            if disk_len > base_count {
                let mut merged_messages = disk_chat
                    .pointer("/messages")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                if let Some(our) = chat.pointer("/messages").and_then(Value::as_array) {
                    merged_messages.extend(our.iter().skip(base_count).cloned());
                }
                chat["messages"] = Value::Array(merged_messages);
                merged = true;
            }
        }
    }
    fs::write(&filepath, chat_to_text(&chat)).map_err(|e| e.to_string())?;
    Ok(json!({
        "ok": true,
        "savedCount": chat.pointer("/messages").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0),
        "merged": merged,
        "relocated": relocated
    }))
}

#[tauri::command]
fn chat_load(app: AppHandle, chat_id: String) -> Result<Value, String> {
    let Some(filepath) = find_chat_file(&app, &chat_id) else {
        return Err(format!("Chat not found: {chat_id}"));
    };
    let text = fs::read_to_string(&filepath).map_err(|e| e.to_string())?;
    let filename = filepath
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    Ok(text_to_chat(&text, filename))
}

#[tauri::command]
fn chat_list(app: AppHandle) -> Result<Value, String> {
    let mut chats = Vec::new();
    for path in list_chat_files(&chats_dir(&app)) {
        if let Ok(text) = fs::read_to_string(&path) {
            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            chats.push(parse_header(&text, filename));
        }
    }
    chats.sort_by(|a, b| {
        b.get("created")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(a.get("created").and_then(Value::as_str).unwrap_or_default())
    });
    Ok(Value::Array(chats))
}

#[tauri::command]
fn chat_delete(app: AppHandle, chat_id: String) -> Result<Value, String> {
    let Some(filepath) = find_chat_file(&app, &chat_id) else {
        return Ok(json!({ "ok": true, "notFound": true }));
    };
    fs::remove_file(&filepath).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_rename(app: AppHandle, chat_id: String, new_title: String) -> Result<Value, String> {
    let Some(filepath) = find_chat_file(&app, &chat_id) else {
        return Err(format!("Chat not found: {chat_id}"));
    };
    let text = fs::read_to_string(&filepath).map_err(|e| e.to_string())?;
    let filename = filepath
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let mut chat = text_to_chat(&text, filename);
    chat["title"] = Value::String(new_title);
    fs::write(&filepath, chat_to_text(&chat)).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_make_private(app: AppHandle, chat_id: String) -> Result<Value, String> {
    let Some(src) = find_chat_file_in(&chats_dir(&app), &chat_id) else {
        return Err(format!("Chat not found: {chat_id}"));
    };
    let private = private_dir(&app);
    ensure_dir(&private)?;
    let dst = private.join(chat_file_name(&chat_id));
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_list_private(app: AppHandle) -> Result<Value, String> {
    let mut chats = Vec::new();
    let private = private_dir(&app);
    if let Ok(entries) = fs::read_dir(private) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("txt") {
                if let Ok(text) = fs::read_to_string(&path) {
                    let filename = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default();
                    chats.push(parse_header(&text, filename));
                }
            }
        }
    }
    Ok(Value::Array(chats))
}

#[tauri::command]
fn chat_unhide(app: AppHandle, chat_id: String) -> Result<Value, String> {
    let Some(src) = find_chat_file_in(&private_dir(&app), &chat_id) else {
        return Err(format!("Private chat not found: {chat_id}"));
    };
    let text = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let filename = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let chat = text_to_chat(&text, filename);
    let month = month_from_chat(&chat);
    let dst_dir = monthly_dir(&chats_dir(&app), &month);
    ensure_dir(&dst_dir)?;
    let dst = dst_dir.join(chat_file_name(&chat_id));
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_list_branch_siblings(app: AppHandle, group_id: String) -> Result<Value, String> {
    let mut siblings = Vec::new();
    for path in list_chat_files(&chats_dir(&app)) {
        if let Ok(text) = fs::read_to_string(&path) {
            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            let header = parse_header(&text, filename);
            if header
                .get("branchGroup")
                .and_then(Value::as_str)
                .filter(|g| !g.is_empty())
                == Some(group_id.as_str())
            {
                siblings.push(header);
            }
        }
    }
    siblings.sort_by(|a, b| {
        a.get("created")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(b.get("created").and_then(Value::as_str).unwrap_or_default())
    });
    Ok(Value::Array(siblings))
}

#[tauri::command]
fn chat_set_branch_group(
    app: AppHandle,
    chat_id: String,
    group_id: String,
) -> Result<Value, String> {
    let Some(filepath) = find_chat_file(&app, &chat_id) else {
        return Err(format!("Chat not found: {chat_id}"));
    };
    let text = fs::read_to_string(&filepath).map_err(|e| e.to_string())?;
    let filename = filepath
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let mut chat = text_to_chat(&text, filename);
    chat["branchGroup"] = Value::String(group_id);
    fs::write(&filepath, chat_to_text(&chat)).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

fn list_meta_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                files.push(path);
            } else if path.is_dir() {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or_default();
                if is_year_dir_name(name) {
                    if let Ok(sub) = fs::read_dir(&path) {
                        for mm_entry in sub.flatten() {
                            let mm_path = mm_entry.path();
                            let mm_name = mm_path
                                .file_name()
                                .and_then(|s| s.to_str())
                                .unwrap_or_default();
                            if mm_path.is_dir() && is_mm_dir_name(mm_name) {
                                if let Ok(chat_entries) = fs::read_dir(&mm_path) {
                                    for ce in chat_entries.flatten() {
                                        let cp = ce.path();
                                        if cp.extension().and_then(|s| s.to_str()) == Some("jsonl")
                                        {
                                            files.push(cp);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

#[tauri::command]
fn chat_meta_record(app: AppHandle, mut entry: Value) -> Result<Value, String> {
    let chat_id = entry
        .get("chatId")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Missing chatId".to_string())?
        .to_string();
    let month = entry
        .get("createdAt")
        .and_then(Value::as_str)
        .map(month_from_iso)
        .unwrap_or_else(|| "unknown".to_string());
    if entry.get("version").is_none() {
        entry["version"] = json!(1);
    }
    entry["storageMonth"] = Value::String(month.clone());
    let dir = monthly_dir(&chat_meta_dir(&app), &month);
    ensure_dir(&dir)?;
    let path = dir.join(format!("{chat_id}.jsonl"));
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open metadata: {e}"))?;
    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| format!("Failed to write metadata: {e}"))?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_meta_load(app: AppHandle, chat_id: String) -> Result<Value, String> {
    let mut entries = Vec::new();
    for path in list_meta_files(&chat_meta_dir(&app)) {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        if stem != chat_id {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            for line in text.lines() {
                if let Ok(v) = serde_json::from_str::<Value>(line) {
                    entries.push(v);
                }
            }
        }
    }
    Ok(Value::Array(entries))
}

#[tauri::command]
fn shell_open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_start_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let url = load_server_url_from_file(app.handle());
            let state = AppState {
                current_cancel: Mutex::new(None),
                server_url: Mutex::new(url),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            chat_send,
            chat_cancel,
            chat_save,
            chat_load,
            chat_list,
            chat_delete,
            chat_rename,
            chat_make_private,
            chat_list_private,
            chat_unhide,
            chat_list_branch_siblings,
            chat_set_branch_group,
            chat_meta_record,
            chat_meta_load,
            get_models,
            get_server_url,
            set_server_url,
            shell_open_external,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_start_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
