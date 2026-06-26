use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    fs,
    io::{BufRead, BufReader, Write},
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
const IMAGE_ANALYSIS_MAX_TOKENS: u64 = 8192;

#[derive(Default)]
struct AppState {
    current_cancel: Mutex<Option<oneshot::Sender<()>>>,
    current_model_load_cancel: Mutex<Option<oneshot::Sender<()>>>,
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

fn analysis_dir(app: &AppHandle) -> PathBuf {
    data_dir(app).join("analysis-projects")
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

fn chat_json_path(text_path: &Path) -> PathBuf {
    text_path.with_extension("json")
}

fn chat_attachment_dir(text_path: &Path) -> PathBuf {
    let stem = text_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("chat");
    text_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("attachments")
        .join(stem)
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

fn ext_from_mime(mime: &str) -> &str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/jpeg" | "image/jpg" => "jpg",
        _ => "jpg",
    }
}

fn mime_from_ext(ext: &str) -> &str {
    match ext.trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "image/jpeg",
    }
}

fn clean_attachment_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect::<String>()
}

fn decode_data_url(data_url: &str) -> Option<(String, Vec<u8>)> {
    let rest = data_url.strip_prefix("data:")?;
    let (meta, b64) = rest.split_once(',')?;
    if !meta.to_ascii_lowercase().contains(";base64") {
        return None;
    }
    let mime = meta.split(';').next().unwrap_or("image/jpeg").to_string();
    let bytes = general_purpose::STANDARD.decode(b64).ok()?;
    Some((mime, bytes))
}

fn attachment_url_filename(url: &str) -> Option<String> {
    url.strip_prefix("attachment://")
        .map(clean_attachment_name)
        .filter(|s| !s.is_empty())
}

fn persist_chat_attachments(chat: &mut Value, text_path: &Path) -> Result<(), String> {
    let Some(messages) = chat.get_mut("messages").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    let attachment_dir = chat_attachment_dir(text_path);

    for (msg_idx, msg) in messages.iter_mut().enumerate() {
        let Some(parts) = msg.get_mut("content").and_then(Value::as_array_mut) else {
            continue;
        };
        for (part_idx, part) in parts.iter_mut().enumerate() {
            if part.get("type").and_then(Value::as_str) != Some("image_url") {
                continue;
            }
            let Some(url) = part
                .pointer("/image_url/url")
                .and_then(Value::as_str)
                .map(str::to_string)
            else {
                continue;
            };

            if attachment_url_filename(&url).is_some() {
                continue;
            }

            let Some((mime, bytes)) = decode_data_url(&url) else {
                continue;
            };

            ensure_dir(&attachment_dir)?;
            let ext = part
                .get("_ext")
                .and_then(Value::as_str)
                .map(clean_attachment_name)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| ext_from_mime(&mime).to_string());
            let existing = part
                .get("_attachment")
                .and_then(Value::as_str)
                .map(clean_attachment_name)
                .filter(|s| !s.is_empty());
            let filename = existing.unwrap_or_else(|| format!("m{msg_idx}_p{part_idx}.{ext}"));
            let path = attachment_dir.join(&filename);
            fs::write(&path, bytes).map_err(|e| format!("Failed to save image attachment: {e}"))?;

            if let Some(obj) = part.as_object_mut() {
                obj.insert("_attachment".into(), Value::String(filename.clone()));
                obj.insert("_ext".into(), Value::String(ext));
                obj.insert(
                    "image_url".into(),
                    json!({ "url": format!("attachment://{filename}") }),
                );
            }
        }
    }
    Ok(())
}

fn hydrate_chat_attachments(chat: &mut Value, text_path: &Path) {
    let Some(messages) = chat.get_mut("messages").and_then(Value::as_array_mut) else {
        return;
    };
    let attachment_dir = chat_attachment_dir(text_path);

    for msg in messages {
        let Some(parts) = msg.get_mut("content").and_then(Value::as_array_mut) else {
            continue;
        };
        for part in parts {
            if part.get("type").and_then(Value::as_str) != Some("image_url") {
                continue;
            }
            let Some(url) = part.pointer("/image_url/url").and_then(Value::as_str) else {
                continue;
            };
            let Some(filename) = attachment_url_filename(url) else {
                continue;
            };
            let path = attachment_dir.join(&filename);
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let ext = part
                .get("_ext")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    Path::new(&filename)
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "jpg".to_string());
            let data_url = format!(
                "data:{};base64,{}",
                mime_from_ext(&ext),
                general_purpose::STANDARD.encode(bytes)
            );
            if let Some(obj) = part.as_object_mut() {
                obj.insert(
                    "image_url".into(),
                    json!({ "url": data_url }),
                );
                obj.insert("_attachment".into(), Value::String(filename));
                obj.insert("_ext".into(), Value::String(ext));
            }
        }
    }
}

fn load_chat_from_file(text_path: &Path) -> Result<Value, String> {
    let filename = text_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let json_path = chat_json_path(text_path);
    if json_path.exists() {
        let json_text = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
        let mut chat: Value = serde_json::from_str(&json_text).map_err(|e| e.to_string())?;
        hydrate_chat_attachments(&mut chat, text_path);
        return Ok(chat);
    }

    let text = fs::read_to_string(text_path).map_err(|e| e.to_string())?;
    Ok(text_to_chat(&text, filename))
}

fn write_chat_bundle(text_path: &Path, chat: &Value) -> Result<(), String> {
    if let Some(parent) = text_path.parent() {
        ensure_dir(parent)?;
    }
    let mut structured = chat.clone();
    persist_chat_attachments(&mut structured, text_path)?;
    fs::write(text_path, chat_to_text(&structured)).map_err(|e| e.to_string())?;
    let json_text = serde_json::to_string_pretty(&structured).map_err(|e| e.to_string())?;
    fs::write(chat_json_path(text_path), json_text).map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_chat_bundle(text_path: &Path) -> Result<(), String> {
    if text_path.exists() {
        fs::remove_file(text_path).map_err(|e| e.to_string())?;
    }
    let json_path = chat_json_path(text_path);
    if json_path.exists() {
        fs::remove_file(json_path).map_err(|e| e.to_string())?;
    }
    let attachments = chat_attachment_dir(text_path);
    if attachments.exists() {
        fs::remove_dir_all(attachments).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn move_chat_bundle(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        ensure_dir(parent)?;
    }
    fs::rename(src, dst).map_err(|e| e.to_string())?;

    let src_json = chat_json_path(src);
    if src_json.exists() {
        fs::rename(src_json, chat_json_path(dst)).map_err(|e| e.to_string())?;
    }

    let src_attachments = chat_attachment_dir(src);
    if src_attachments.exists() {
        let dst_attachments = chat_attachment_dir(dst);
        if let Some(parent) = dst_attachments.parent() {
            ensure_dir(parent)?;
        }
        fs::rename(src_attachments, dst_attachments).map_err(|e| e.to_string())?;
    }
    Ok(())
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

fn stable_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in text.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    radix36(hash)
}

fn jsonl_append(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", serde_json::to_string(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

fn read_jsonl(path: &Path) -> Result<Vec<Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(serde_json::from_str::<Value>(trimmed).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn sanitize_id_part(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == '-' || ch == '_' {
            out.push(ch);
        }
        if out.len() >= 42 {
            break;
        }
    }
    if out.is_empty() {
        "dataset".to_string()
    } else {
        out
    }
}

fn source_analysis_dir(app: &AppHandle, source_format: &str) -> PathBuf {
    analysis_dir(app).join(source_format)
}

fn source_dataset_dir(app: &AppHandle, source_format: &str, dataset_id: &str) -> PathBuf {
    source_analysis_dir(app, source_format).join(dataset_id)
}

fn dataset_dir(app: &AppHandle, dataset_id: &str) -> PathBuf {
    let root = analysis_dir(app);
    let flat = root.join(dataset_id);
    if flat.exists() {
        return flat;
    }
    for source in ["anthropic", "openai"] {
        let path = root.join(source).join(dataset_id);
        if path.exists() {
            return path;
        }
    }
    flat
}

fn run_dir(app: &AppHandle, dataset_id: &str, run_id: &str) -> PathBuf {
    dataset_dir(app, dataset_id).join("runs").join(run_id)
}

fn omit_code_blocks_for_analysis(text: &str) -> (String, usize, usize) {
    let mut out = String::new();
    let mut in_fence = false;
    let mut omitted_blocks = 0usize;
    let mut omitted_chars = 0usize;
    let mut current_omitted = 0usize;

    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            if in_fence {
                omitted_blocks += 1;
                out.push_str(&format!(
                    "\n[omitted code/output block: {} chars]\n",
                    current_omitted
                ));
                current_omitted = 0;
            }
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            current_omitted += line.len() + 1;
            omitted_chars += line.len() + 1;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }

    if in_fence {
        omitted_blocks += 1;
        out.push_str(&format!(
            "\n[omitted unterminated code/output block: {} chars]\n",
            current_omitted
        ));
    }

    (out.trim().to_string(), omitted_blocks, omitted_chars)
}

fn timestamp_from_message(obj: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    obj.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
}

fn push_record(
    records: &mut Vec<Value>,
    source_path: &str,
    obj: &serde_json::Map<String, Value>,
    content_idx: Option<usize>,
    text: &str,
    start_timestamp: Option<String>,
    stop_timestamp: Option<String>,
) {
    let clean = text.trim();
    if clean.is_empty() {
        return;
    }

    let uuid = obj
        .get("uuid")
        .or_else(|| obj.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let sender = obj
        .get("sender")
        .or_else(|| obj.get("role"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let created_at = timestamp_from_message(obj, "created_at")
        .or_else(|| timestamp_from_message(obj, "createdAt"))
        .or_else(|| start_timestamp.clone())
        .unwrap_or_default();
    let record_key = format!(
        "{}:{}:{}:{}",
        uuid,
        content_idx.map(|i| i.to_string()).unwrap_or_else(|| "text".into()),
        created_at,
        clean
    );
    let (analysis_text, omitted_blocks, omitted_chars) = omit_code_blocks_for_analysis(clean);

    records.push(json!({
        "record_id": format!("rec_{}", stable_hash(&record_key)),
        "source_message_uuid": uuid,
        "sender": sender,
        "created_at": created_at,
        "updated_at": timestamp_from_message(obj, "updated_at").unwrap_or_default(),
        "start_timestamp": start_timestamp.unwrap_or_else(|| created_at.clone()),
        "stop_timestamp": stop_timestamp.unwrap_or_default(),
        "parent_message_uuid": obj.get("parent_message_uuid").and_then(Value::as_str).unwrap_or(""),
        "source_path": source_path,
        "content_index": content_idx,
        "text": clean,
        "analysis_text": analysis_text,
        "omitted_code_blocks": omitted_blocks,
        "omitted_code_chars": omitted_chars
    }));
}

fn format_openai_timestamp(value: Option<&Value>) -> String {
    match value {
        Some(Value::Number(n)) => n
            .as_f64()
            .map(|v| format!("{v:.3}"))
            .unwrap_or_else(|| n.to_string()),
        Some(Value::String(s)) => s.trim().to_string(),
        _ => String::new(),
    }
}

fn openai_content_parts(content: &Value) -> Vec<String> {
    let content_type = content
        .get("content_type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if content_type != "text" && content_type != "multimodal_text" {
        return Vec::new();
    }

    content
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| match part {
                    Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
                    Value::Object(obj)
                        if obj.get("content_type").and_then(Value::as_str)
                            == Some("audio_transcription") =>
                    {
                        obj.get("text")
                            .and_then(Value::as_str)
                            .filter(|text| !text.trim().is_empty())
                            .map(|text| format!("[Transcript]: {text}"))
                    }
                    Value::Object(obj) => obj
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|text| !text.trim().is_empty())
                        .map(str::to_string),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn openai_author_role(message: &serde_json::Map<String, Value>) -> &str {
    message
        .get("author")
        .and_then(Value::as_object)
        .and_then(|author| author.get("role"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
}

fn push_openai_record(
    records: &mut Vec<Value>,
    source_path: &str,
    conversation: &serde_json::Map<String, Value>,
    node_id: &str,
    parent_id: &str,
    message: &serde_json::Map<String, Value>,
    text: &str,
) {
    let clean = text.trim();
    if clean.is_empty() {
        return;
    }

    let message_id = message
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(node_id);
    let role = openai_author_role(message);
    let created_at = format_openai_timestamp(message.get("create_time"));
    let conversation_id = conversation
        .get("conversation_id")
        .or_else(|| conversation.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let title = conversation
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let record_key = format!("{conversation_id}:{message_id}:{created_at}:{clean}");
    let (analysis_text, omitted_blocks, omitted_chars) = omit_code_blocks_for_analysis(clean);

    records.push(json!({
        "record_id": format!("rec_{}", stable_hash(&record_key)),
        "source_message_uuid": message_id,
        "sender": role,
        "created_at": created_at,
        "updated_at": format_openai_timestamp(conversation.get("update_time")),
        "start_timestamp": created_at,
        "stop_timestamp": "",
        "parent_message_uuid": parent_id,
        "source_path": source_path,
        "conversation_id": conversation_id,
        "conversation_title": title,
        "content_index": 0,
        "text": clean,
        "analysis_text": analysis_text,
        "omitted_code_blocks": omitted_blocks,
        "omitted_code_chars": omitted_chars
    }));
}

fn extract_openai_conversation_records(
    conversation: &serde_json::Map<String, Value>,
    source_path: &str,
    records: &mut Vec<Value>,
) -> usize {
    let Some(mapping) = conversation.get("mapping").and_then(Value::as_object) else {
        return 0;
    };
    let mut current = conversation
        .get("current_node")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if current.is_empty() {
        return 0;
    }

    let mut path = Vec::<(String, Value)>::new();
    let mut seen = BTreeSet::<String>::new();
    while !current.is_empty() && seen.insert(current.clone()) {
        let Some(node) = mapping.get(&current).cloned() else {
            break;
        };
        let parent = node
            .get("parent")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        path.push((current, node));
        current = parent;
    }

    path.reverse();
    let before = records.len();
    for (node_id, node) in path {
        let Some(node_obj) = node.as_object() else {
            continue;
        };
        let Some(message) = node_obj.get("message").and_then(Value::as_object) else {
            continue;
        };
        if message
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        {
            continue;
        }
        let role = openai_author_role(message);
        let is_user_system_message = message
            .get("metadata")
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("is_user_system_message"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if role == "system" && !is_user_system_message {
            continue;
        }
        let Some(content) = message.get("content") else {
            continue;
        };
        let text = openai_content_parts(content).join("\n\n");
        let parent_id = node_obj.get("parent").and_then(Value::as_str).unwrap_or("");
        push_openai_record(
            records,
            source_path,
            conversation,
            &node_id,
            parent_id,
            message,
            &text,
        );
    }
    records.len() - before
}

fn extract_openai_records_from_value(
    value: &Value,
    source_path: &str,
    records: &mut Vec<Value>,
) -> usize {
    let before = records.len();
    match value {
        Value::Array(items) => {
            for item in items {
                if let Some(obj) = item.as_object() {
                    extract_openai_conversation_records(obj, source_path, records);
                }
            }
        }
        Value::Object(obj) => {
            extract_openai_conversation_records(obj, source_path, records);
        }
        _ => {}
    }
    records.len() - before
}

fn extract_records_from_value(value: &Value, source_path: &str, records: &mut Vec<Value>) {
    match value {
        Value::Array(items) => {
            for item in items {
                extract_records_from_value(item, source_path, records);
            }
        }
        Value::Object(obj) => {
            let has_message_shape = obj.contains_key("sender")
                || obj.contains_key("role")
                || obj.contains_key("uuid")
                || obj.contains_key("id")
                || obj.contains_key("content");

            if has_message_shape {
                if let Some(content) = obj.get("content").and_then(Value::as_array) {
                    let mut emitted = false;
                    for (idx, item) in content.iter().enumerate() {
                        if let Some(text) = item.get("text").and_then(Value::as_str) {
                            push_record(
                                records,
                                source_path,
                                obj,
                                Some(idx),
                                text,
                                item.get("start_timestamp")
                                    .and_then(Value::as_str)
                                    .map(str::to_string),
                                item.get("stop_timestamp")
                                    .and_then(Value::as_str)
                                    .map(str::to_string),
                            );
                            emitted = true;
                        }
                    }
                    if !emitted {
                        if let Some(text) = obj.get("text").and_then(Value::as_str) {
                            push_record(records, source_path, obj, None, text, None, None);
                        }
                    }
                } else if let Some(text) = obj.get("text").and_then(Value::as_str) {
                    push_record(records, source_path, obj, None, text, None, None);
                }
            }

            for child in obj.values() {
                match child {
                    Value::Array(_) | Value::Object(_) => {
                        extract_records_from_value(child, source_path, records)
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

fn analysis_manifest_path(app: &AppHandle, dataset_id: &str) -> PathBuf {
    dataset_dir(app, dataset_id).join("manifest.json")
}

fn extract_balanced_json(text: &str, start_idx: usize) -> Option<&str> {
    let bytes = text.as_bytes();
    let opener = *bytes.get(start_idx)? as char;
    let closer = match opener {
        '[' => ']',
        '{' => '}',
        _ => return None,
    };
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, ch) in text[start_idx..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
        } else if ch == opener {
            depth += 1;
        } else if ch == closer {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                let end = start_idx + offset + ch.len_utf8();
                return text.get(start_idx..end);
            }
        }
    }
    None
}

fn parse_analysis_source(source_text: &str, source_format: &str) -> Result<Value, String> {
    match serde_json::from_str::<Value>(source_text) {
        Ok(value) => Ok(value),
        Err(json_err) if source_format == "openai" => {
            let marker = "var jsonData";
            let marker_idx = source_text
                .find(marker)
                .ok_or_else(|| format!("Could not parse JSON: {json_err}"))?;
            let after_marker = &source_text[marker_idx + marker.len()..];
            let equals_idx = after_marker.find('=').ok_or_else(|| {
                "Could not find jsonData assignment in ChatGPT HTML export.".to_string()
            })?;
            let json_start = marker_idx
                + marker.len()
                + equals_idx
                + 1
                + after_marker[equals_idx + 1..]
                    .find(|ch| ch == '[' || ch == '{')
                    .ok_or_else(|| {
                        "Could not find jsonData JSON payload in ChatGPT HTML export.".to_string()
                    })?;
            let payload = extract_balanced_json(source_text, json_start).ok_or_else(|| {
                "Could not read complete jsonData payload from ChatGPT HTML export.".to_string()
            })?;
            serde_json::from_str::<Value>(payload)
                .map_err(|e| format!("Could not parse ChatGPT HTML jsonData payload: {e}"))
        }
        Err(err) => Err(format!("Could not parse JSON: {err}")),
    }
}

fn chunks_path(app: &AppHandle, dataset_id: &str) -> PathBuf {
    dataset_dir(app, dataset_id).join("normalized").join("chunks.jsonl")
}

fn records_path(app: &AppHandle, dataset_id: &str) -> PathBuf {
    dataset_dir(app, dataset_id).join("normalized").join("records.jsonl")
}

fn count_jsonl(path: &Path) -> usize {
    read_jsonl(path).map(|v| v.len()).unwrap_or(0)
}

fn unique_chunk_count(path: &Path) -> usize {
    read_jsonl(path)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("chunk_id").and_then(Value::as_str).map(str::to_string))
                .collect::<BTreeSet<_>>()
                .len()
        })
        .unwrap_or(0)
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
    if options
        .as_ref()
        .and_then(|o| o.get("responseFormatJson"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        body["response_format"] = json!({ "type": "json_object" });
    }
    let reasoning_preference = options
        .as_ref()
        .and_then(|o| o.get("reasoningRequested"))
        .and_then(Value::as_bool);
    if let Some(enabled) = reasoning_preference {
        if enabled {
            body["reasoning_effort"] = json!("medium");
            body["enable_thinking"] = json!(true);
            body["thinking"] = json!(true);
        } else {
            body["reasoning_effort"] = json!("none");
            body["enable_thinking"] = json!(false);
            body["thinking"] = json!(false);
        }
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
            "streaming": true,
            "reasoningRequested": reasoning_preference,
            "reasoningMode": match reasoning_preference { Some(true) => "ask_on", Some(false) => "explicit_off", None => "unspecified" }
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

    let mut response = match response {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("Connection failed: {e}");
            dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
            return json!({ "error": msg });
        }
    };
    let mut reasoning_fallback = false;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        if reasoning_preference.is_some() {
            let mut fallback_body = body.clone();
            if let Some(obj) = fallback_body.as_object_mut() {
                obj.remove("reasoning_effort");
                obj.remove("enable_thinking");
                obj.remove("thinking");
            }
            dev_log(
                &window,
                "response",
                json!({
                    "endpoint": endpoint,
                    "model": model,
                    "durationMs": now_ms().saturating_sub(start),
                    "status": "reasoning_hint_rejected",
                    "error": format!("Server returned {status}: {body_text}"),
                    "retryingWithoutReasoning": true
                }),
            );
            let retry = client.post(&endpoint).json(&fallback_body).send();
            response = match tokio::select! {
                _ = &mut cancel_rx => {
                    dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "cancelled" }));
                    return json!({ "cancelled": true });
                }
                r = retry => r
            } {
                Ok(r) => r,
                Err(e) => {
                    let msg = format!("Connection failed after reasoning fallback: {e}");
                    dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
                    return json!({ "error": msg, "reasoningFallback": true });
                }
            };
            reasoning_fallback = true;
        } else {
            let msg = format!("Server error {status}: {body_text}");
            dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
            return json!({ "error": msg, "reasoningFallback": false });
        }
    }

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let msg = format!("Server error {status}: {body_text}");
        dev_log(&window, "response", json!({ "endpoint": endpoint, "model": model, "durationMs": now_ms().saturating_sub(start), "status": "error", "error": msg }));
        return json!({ "error": msg, "reasoningFallback": reasoning_fallback });
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
            "status": "success",
            "reasoningRequested": reasoning_preference,
            "reasoningFallback": reasoning_fallback
        }),
    );

    if let Ok(mut current) = state.current_cancel.lock() {
        *current = None;
    }

    json!({ "content": full_content, "reasoningRequested": reasoning_preference, "reasoningFallback": reasoning_fallback })
}

async fn post_image_analysis_stream(
    window: WebviewWindow,
    state: tauri::State<'_, AppState>,
    messages: Value,
    options: Option<Value>,
    stream_channel: Channel<String>,
) -> Value {
    let mut effective = Vec::<Value>::new();
    effective.push(json!({
        "role": "system",
        "content": "Describe the attached image for another language model that may not be able to inspect images. Include visible text, objects, layout, chart/table details, UI elements, notable colors, and any context needed to answer later questions. Be thorough and specific while avoiding speculation. Do not claim you cannot see the image if it is provided."
    }));
    if let Some(arr) = messages.as_array() {
        effective.extend(arr.iter().cloned());
    }

    let mut analysis_options = options.unwrap_or_else(|| json!({}));
    if analysis_options.get("temperature").is_none() {
        analysis_options["temperature"] = json!(0.2);
    }
    if analysis_options.get("maxTokens").is_none() {
        analysis_options["maxTokens"] = json!(IMAGE_ANALYSIS_MAX_TOKENS);
    }

    post_stream(
        window,
        state,
        Value::Array(effective),
        Some(analysis_options),
        stream_channel,
    )
    .await
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
async fn chat_analyze_image(
    window: WebviewWindow,
    state: tauri::State<'_, AppState>,
    messages: Value,
    options: Option<Value>,
    stream_channel: Channel<String>,
) -> Result<Value, String> {
    Ok(post_image_analysis_stream(window, state, messages, options, stream_channel).await)
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
fn analysis_import(
    app: AppHandle,
    source_path: String,
    source_format: String,
) -> Result<Value, String> {
    let source_format = source_format.trim().to_ascii_lowercase();
    if source_format != "anthropic" && source_format != "openai" {
        return Err(
            "Choose Anthropic / Claude export or OpenAI / ChatGPT export before importing."
                .to_string(),
        );
    }
    let source = PathBuf::from(source_path.trim().trim_matches('"'));
    if !source.exists() {
        return Err(format!("File not found: {}", source.display()));
    }
    let source_text = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    let parsed = parse_analysis_source(&source_text, &source_format)?;
    let source_name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("dataset");
    let dataset_id = format!(
        "{}_{}_{}",
        source_format,
        sanitize_id_part(source_name),
        stable_hash(&format!("{}:{}:{}", source.display(), source_text.len(), now_ms()))
            .chars()
            .take(8)
            .collect::<String>()
    );
    let root = source_dataset_dir(&app, &source_format, &dataset_id);
    ensure_dir(&root.join("source"))?;
    ensure_dir(&root.join("normalized"))?;
    let source_ext = source
        .extension()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("json");
    fs::copy(
        &source,
        root.join("source").join(format!("original.{source_ext}")),
    )
    .map_err(|e| e.to_string())?;

    let mut records = Vec::new();
    let conversation_count = match &parsed {
        Value::Array(items) => items.len(),
        Value::Object(_) => 1,
        _ => 0,
    };
    if source_format == "openai" {
        extract_openai_records_from_value(&parsed, &source.display().to_string(), &mut records);
    } else {
        extract_records_from_value(&parsed, &source.display().to_string(), &mut records);
    }
    if records.is_empty() {
        return Err(format!(
            "No analyzable records found for {} export.",
            if source_format == "openai" {
                "OpenAI / ChatGPT"
            } else {
                "Anthropic / Claude"
            }
        ));
    }
    records.sort_by(|a, b| {
        a.get("start_timestamp")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("start_timestamp").and_then(Value::as_str).unwrap_or(""))
    });

    let records_file = records_path(&app, &dataset_id);
    fs::write(&records_file, "").map_err(|e| e.to_string())?;
    let mut omitted_blocks = 0usize;
    let mut omitted_chars = 0usize;
    for record in &records {
        omitted_blocks += record
            .get("omitted_code_blocks")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize;
        omitted_chars += record
            .get("omitted_code_chars")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize;
        jsonl_append(&records_file, record)?;
    }

    let time_start = records
        .first()
        .and_then(|r| r.get("start_timestamp"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let time_end = records
        .last()
        .and_then(|r| r.get("stop_timestamp").or_else(|| r.get("start_timestamp")))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let manifest = json!({
        "dataset_id": dataset_id,
        "adapter": if source_format == "openai" { "openai_chatgpt_export_v1" } else { "conversation_export_v1" },
        "source_format": source_format,
        "schema_version": "0.1.0",
        "source_file": source.display().to_string(),
        "imported_at_ms": now_ms() as u64,
        "conversation_count": conversation_count,
        "record_count": records.len(),
        "chunk_count": 0,
        "omitted_code_blocks": omitted_blocks,
        "omitted_code_chars": omitted_chars,
        "time_start": time_start,
        "time_end": time_end
    });
    fs::write(
        analysis_manifest_path(&app, manifest["dataset_id"].as_str().unwrap()),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(manifest)
}

fn list_analysis_manifest_paths(app: &AppHandle, source_format: &str) -> Result<Vec<PathBuf>, String> {
    let root = analysis_dir(&app);
    ensure_dir(&root)?;
    let mut paths = BTreeSet::<PathBuf>::new();
    let source_root = source_analysis_dir(app, source_format);
    if source_root.exists() {
        for entry in fs::read_dir(source_root).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path().join("manifest.json");
            if path.exists() {
                paths.insert(path);
            }
        }
    }
    for entry in fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path().join("manifest.json");
        if path.exists() {
            paths.insert(path);
        }
    }
    Ok(paths.into_iter().collect())
}

#[tauri::command]
fn analysis_list(app: AppHandle, source_format: Option<String>) -> Result<Value, String> {
    let source_format = source_format
        .unwrap_or_else(|| "anthropic".to_string())
        .trim()
        .to_ascii_lowercase();
    if source_format != "anthropic" && source_format != "openai" {
        return Err("Unknown analysis source format.".to_string());
    }
    let mut items = Vec::new();
    for path in list_analysis_manifest_paths(&app, &source_format)? {
        if let Ok(text) = fs::read_to_string(path) {
            if let Ok(mut manifest) = serde_json::from_str::<Value>(&text) {
                let manifest_source = manifest
                    .get("source_format")
                    .and_then(Value::as_str)
                    .unwrap_or("anthropic");
                if manifest_source != source_format {
                    continue;
                }
                if let Some(id) = manifest.get("dataset_id").and_then(Value::as_str) {
                    manifest["chunk_count"] = json!(count_jsonl(&chunks_path(&app, id)));
                }
                items.push(manifest);
            }
        }
    }
    items.sort_by(|a, b| {
        b.get("imported_at_ms")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .cmp(&a.get("imported_at_ms").and_then(Value::as_u64).unwrap_or(0))
    });
    Ok(Value::Array(items))
}

#[tauri::command]
fn analysis_build_chunks(
    app: AppHandle,
    dataset_id: String,
    target_chars: Option<usize>,
) -> Result<Value, String> {
    let target = target_chars.unwrap_or(18_000).clamp(4_000, 80_000);
    let records = read_jsonl(&records_path(&app, &dataset_id))?;
    if records.is_empty() {
        return Err("Dataset has no normalized records.".to_string());
    }

    let out_path = chunks_path(&app, &dataset_id);
    fs::write(&out_path, "").map_err(|e| e.to_string())?;
    let mut chunks = Vec::<Value>::new();
    let mut current_records = Vec::<String>::new();
    let mut current_text = String::new();
    let mut time_start = String::new();
    let mut time_end = String::new();
    let mut idx = 0usize;

    let flush = |chunks: &mut Vec<Value>,
                 out_path: &Path,
                 idx: &mut usize,
                 current_records: &mut Vec<String>,
                 current_text: &mut String,
                 time_start: &mut String,
                 time_end: &mut String|
     -> Result<(), String> {
        if current_text.trim().is_empty() {
            return Ok(());
        }
        let chunk_id = format!("chunk_{:06}", *idx);
        let chunk = json!({
            "chunk_id": chunk_id,
            "time_start": time_start.as_str(),
            "time_end": time_end.as_str(),
            "record_ids": current_records.clone(),
            "char_count": current_text.len(),
            "input_hash": stable_hash(current_text.as_str()),
            "text": current_text.trim()
        });
        jsonl_append(out_path, &chunk)?;
        chunks.push(chunk);
        *idx += 1;
        current_records.clear();
        current_text.clear();
        time_start.clear();
        time_end.clear();
        Ok(())
    };

    for record in records {
        let record_id = record
            .get("record_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let text = record
            .get("analysis_text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if text.is_empty() {
            continue;
        }
        let sender = record.get("sender").and_then(Value::as_str).unwrap_or("unknown");
        let ts = record
            .get("start_timestamp")
            .and_then(Value::as_str)
            .or_else(|| record.get("created_at").and_then(Value::as_str))
            .unwrap_or("");
        let entry = format!("[{}] {} ({})\n{}\n\n", ts, sender, record_id, text);
        if !current_text.is_empty() && current_text.len() + entry.len() > target {
            flush(
                &mut chunks,
                &out_path,
                &mut idx,
                &mut current_records,
                &mut current_text,
                &mut time_start,
                &mut time_end,
            )?;
        }
        if time_start.is_empty() {
            time_start = ts.to_string();
        }
        time_end = ts.to_string();
        current_records.push(record_id);
        current_text.push_str(&entry);
    }

    flush(
        &mut chunks,
        &out_path,
        &mut idx,
        &mut current_records,
        &mut current_text,
        &mut time_start,
        &mut time_end,
    )?;

    let manifest_path = analysis_manifest_path(&app, &dataset_id);
    if let Ok(text) = fs::read_to_string(&manifest_path) {
        if let Ok(mut manifest) = serde_json::from_str::<Value>(&text) {
            manifest["chunk_count"] = json!(chunks.len());
            manifest["chunk_target_chars"] = json!(target);
            let _ = fs::write(
                manifest_path,
                serde_json::to_string_pretty(&manifest).unwrap_or_default(),
            );
        }
    }

    Ok(json!({ "dataset_id": dataset_id, "chunk_count": chunks.len(), "target_chars": target }))
}

#[tauri::command]
fn analysis_create_run(
    app: AppHandle,
    dataset_id: String,
    settings: Option<Value>,
) -> Result<Value, String> {
    let chunks = read_jsonl(&chunks_path(&app, &dataset_id))?;
    if chunks.is_empty() {
        return Err("Build chunks before creating a run.".to_string());
    }
    let run_id = format!("run_{}", radix36(now_ms() as u64));
    let dir = run_dir(&app, &dataset_id, &run_id);
    ensure_dir(&dir)?;
    let manifest = json!({
        "run_id": run_id,
        "dataset_id": dataset_id,
        "pipeline_version": "0.1.0",
        "created_at_ms": now_ms() as u64,
        "settings": settings.unwrap_or_else(|| json!({})),
        "status": "ready",
        "chunk_count": chunks.len()
    });
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::write(dir.join("pass_topic_chunks.jsonl"), "").map_err(|e| e.to_string())?;
    fs::write(dir.join("errors.jsonl"), "").map_err(|e| e.to_string())?;
    Ok(manifest)
}

#[tauri::command]
fn analysis_list_runs(app: AppHandle, dataset_id: String) -> Result<Value, String> {
    let root = dataset_dir(&app, &dataset_id).join("runs");
    ensure_dir(&root)?;
    let mut runs = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let manifest_path = entry.path().join("manifest.json");
        if let Ok(text) = fs::read_to_string(&manifest_path) {
            if let Ok(mut manifest) = serde_json::from_str::<Value>(&text) {
                let run_id = manifest
                    .get("run_id")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let result_count = unique_chunk_count(
                    &run_dir(&app, &dataset_id, &run_id).join("pass_topic_chunks.jsonl"),
                );
                manifest["processed_count"] = json!(result_count);
                runs.push(manifest);
            }
        }
    }
    runs.sort_by(|a, b| {
        b.get("created_at_ms")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .cmp(&a.get("created_at_ms").and_then(Value::as_u64).unwrap_or(0))
    });
    Ok(Value::Array(runs))
}

#[tauri::command]
fn analysis_run_state(app: AppHandle, dataset_id: String, run_id: String) -> Result<Value, String> {
    let chunks = read_jsonl(&chunks_path(&app, &dataset_id))?;
    let results = read_jsonl(&run_dir(&app, &dataset_id, &run_id).join("pass_topic_chunks.jsonl"))?;
    let done_set: BTreeSet<String> = results
        .iter()
        .filter_map(|r| r.get("chunk_id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let done_ids: Vec<Value> = done_set.iter().cloned().map(Value::String).collect();
    Ok(json!({
        "dataset_id": dataset_id,
        "run_id": run_id,
        "chunk_count": chunks.len(),
        "processed_count": done_ids.len(),
        "result_line_count": results.len(),
        "done_chunk_ids": done_ids,
        "chunks": chunks
    }))
}

#[tauri::command]
fn analysis_save_topic_result(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
    result: Value,
) -> Result<Value, String> {
    let path = run_dir(&app, &dataset_id, &run_id).join("pass_topic_chunks.jsonl");
    jsonl_append(&path, &result)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn analysis_save_error(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
    error: Value,
) -> Result<Value, String> {
    let path = run_dir(&app, &dataset_id, &run_id).join("errors.jsonl");
    jsonl_append(&path, &error)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn analysis_load_topic_results(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
) -> Result<Value, String> {
    Ok(Value::Array(read_jsonl(
        &run_dir(&app, &dataset_id, &run_id).join("pass_topic_chunks.jsonl"),
    )?))
}

#[tauri::command]
fn analysis_save_canon_batch(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
    batch_id: String,
    graph: Value,
) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id).join("canonization");
    ensure_dir(&dir)?;
    let safe_batch = sanitize_id_part(&batch_id);
    let path = dir.join(format!("{safe_batch}.json"));
    fs::write(
        &path,
        serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.display().to_string() }))
}

#[tauri::command]
fn analysis_list_canon_batches(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id).join("canonization");
    ensure_dir(&dir)?;
    let mut items = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(mut graph) = serde_json::from_str::<Value>(&text) {
                graph["_path"] = json!(path.display().to_string());
                graph["_batch_id"] = json!(
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string()
                );
                items.push(graph);
            }
        }
    }
    items.sort_by(|a, b| {
        a.get("_batch_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("_batch_id").and_then(Value::as_str).unwrap_or(""))
    });
    Ok(Value::Array(items))
}

#[tauri::command]
fn analysis_save_graph(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
    graph: Value,
) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id);
    ensure_dir(&dir)?;
    let path = dir.join("output_graph.json");
    fs::write(
        &path,
        serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.display().to_string() }))
}

fn run_log_path(app: &AppHandle, dataset_id: &str, run_id: &str, log_kind: &str) -> PathBuf {
    let safe_kind = sanitize_id_part(log_kind);
    run_dir(app, dataset_id, run_id)
        .join("logs")
        .join(format!("{safe_kind}_{run_id}.txt"))
}

#[tauri::command]
fn analysis_append_log(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
    log_kind: String,
    line: String,
) -> Result<Value, String> {
    let path = run_log_path(&app, &dataset_id, &run_id, &log_kind);
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let exists = path.exists();
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    if !exists {
        writeln!(
            file,
            "Local LLM Chat data analysis log\nkind: {log_kind}\ndataset: {dataset_id}\nrun: {run_id}\ncreated: {}\n",
            now_ms()
        )
        .map_err(|e| e.to_string())?;
    }
    writeln!(file, "{line}").map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.display().to_string() }))
}

#[tauri::command]
fn analysis_paths(app: AppHandle, dataset_id: String, run_id: String) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id);
    Ok(json!({
        "runDir": dir.display().to_string(),
        "outputGraph": dir.join("output_graph.json").display().to_string(),
        "canonizationDir": dir.join("canonization").display().to_string(),
        "logsDir": dir.join("logs").display().to_string(),
        "analysisLog": run_log_path(&app, &dataset_id, &run_id, "analysis").display().to_string(),
        "testLog": run_log_path(&app, &dataset_id, &run_id, "test").display().to_string()
    }))
}

#[tauri::command]
fn analysis_open_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim().trim_matches('"'));
    if !path.exists() {
        return Err(format!("Path not found: {}", path.display()));
    }
    #[cfg(target_os = "windows")]
    {
        let arg = if path.is_file() {
            format!("/select,{}", path.display())
        } else {
            path.display().to_string()
        };
        Command::new("explorer")
            .arg(arg)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(if path.is_file() {
                path.parent().unwrap_or(&path)
            } else {
                &path
            })
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(if path.is_file() {
                path.parent().unwrap_or(&path)
            } else {
                &path
            })
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn analysis_reset_topics(app: AppHandle, dataset_id: String, run_id: String) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id);
    ensure_dir(&dir)?;
    fs::write(dir.join("pass_topic_chunks.jsonl"), "").map_err(|e| e.to_string())?;
    fs::write(dir.join("errors.jsonl"), "").map_err(|e| e.to_string())?;
    let canon_dir = dir.join("canonization");
    if canon_dir.exists() {
        fs::remove_dir_all(&canon_dir).map_err(|e| e.to_string())?;
    }
    let graph_path = dir.join("output_graph.json");
    if graph_path.exists() {
        fs::remove_file(&graph_path).map_err(|e| e.to_string())?;
    }
    Ok(json!({
        "ok": true,
        "cleared": ["pass_topic_chunks.jsonl", "errors.jsonl", "canonization", "output_graph.json"]
    }))
}

#[tauri::command]
fn analysis_reset_canonization(
    app: AppHandle,
    dataset_id: String,
    run_id: String,
) -> Result<Value, String> {
    let dir = run_dir(&app, &dataset_id, &run_id);
    ensure_dir(&dir)?;
    let canon_dir = dir.join("canonization");
    if canon_dir.exists() {
        fs::remove_dir_all(&canon_dir).map_err(|e| e.to_string())?;
    }
    let graph_path = dir.join("output_graph.json");
    if graph_path.exists() {
        fs::remove_file(&graph_path).map_err(|e| e.to_string())?;
    }
    Ok(json!({
        "ok": true,
        "cleared": ["canonization", "output_graph.json"]
    }))
}

fn text_has_vision_hint(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    ["image", "images", "vision", "visual", "multimodal", "vl", "video"]
        .iter()
        .any(|hint| lower.contains(hint))
}

fn value_has_vision_hint(value: &Value, depth: u8) -> bool {
    if depth > 4 {
        return false;
    }
    match value {
        Value::String(s) => text_has_vision_hint(s),
        Value::Array(items) => items
            .iter()
            .any(|item| value_has_vision_hint(item, depth + 1)),
        Value::Object(map) => map.iter().any(|(key, val)| {
            (text_has_vision_hint(key) && val != &Value::Bool(false))
                || value_has_vision_hint(val, depth + 1)
        }),
        _ => false,
    }
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
            let vision = value_has_vision_hint(&m, 0);
            json!({
                "id": id,
                "contextLength": ctx,
                "vision": if vision { Value::Bool(true) } else { Value::Null },
                "visionSource": if vision { "server metadata" } else { "" },
                "raw": m
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({ "models": models }))
}

#[tauri::command]
async fn load_model(window: WebviewWindow, state: tauri::State<'_, AppState>, model: String) -> Result<Value, String> {
    let server_url = state.server_url.lock().unwrap().clone();
    let endpoint = format!("{}/api/v1/models/load", server_url.trim_end_matches('/'));
    let start = now_ms();
    let (cancel_tx, mut cancel_rx) = oneshot::channel();
    if let Ok(mut current) = state.current_model_load_cancel.lock() {
        if let Some(cancel) = current.take() {
            let _ = cancel.send(());
        }
        *current = Some(cancel_tx);
    }

    dev_log(
        &window,
        "request",
        json!({
            "endpoint": endpoint,
            "method": "POST",
            "model": model,
            "purpose": "preload"
        }),
    );

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let request = client
        .post(&endpoint)
        .json(&json!({ "model": model }))
        .send();
    let resp = tokio::select! {
        _ = &mut cancel_rx => {
            dev_log(
                &window,
                "response",
                json!({
                    "endpoint": endpoint,
                    "model": model,
                    "durationMs": now_ms().saturating_sub(start),
                    "status": "cancelled"
                }),
            );
            return Ok(json!({ "ok": false, "cancelled": true }));
        }
        resp = request => resp.map_err(|e| format!("Model load request failed: {e}"))?
    };
    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        dev_log(
            &window,
            "response",
            json!({
                "endpoint": endpoint,
                "model": model,
                "durationMs": now_ms().saturating_sub(start),
                "status": "error",
                "error": format!("Server returned {status}: {body_text}")
            }),
        );
        if let Ok(mut current) = state.current_model_load_cancel.lock() {
            *current = None;
        }
        return Ok(json!({
            "ok": false,
            "unsupported": status.as_u16() == 404,
            "status": status.as_u16(),
            "error": body_text
        }));
    }

    let data: Value = serde_json::from_str(&body_text).unwrap_or_else(|_| json!({ "body": body_text }));
    dev_log(
        &window,
        "response",
        json!({
            "endpoint": endpoint,
            "model": model,
            "durationMs": now_ms().saturating_sub(start),
            "status": "success"
        }),
    );
    if let Ok(mut current) = state.current_model_load_cancel.lock() {
        *current = None;
    }
    Ok(json!({ "ok": true, "result": data }))
}

#[tauri::command]
async fn exa_search(
    window: WebviewWindow,
    query: String,
    options: Option<Value>,
) -> Result<Value, String> {
    let api_key = options
        .as_ref()
        .and_then(|o| o.get("apiKey"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Missing Exa API key. Add it in Settings → General.".to_string())?;

    let num_results = options
        .as_ref()
        .and_then(|o| o.get("numResults"))
        .and_then(Value::as_u64)
        .filter(|&n| (1..=10).contains(&n))
        .unwrap_or(5);

    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Empty search query.".to_string());
    }

    let start = now_ms();
    dev_log(
        &window,
        "request",
        json!({
            "endpoint": "https://api.exa.ai/search",
            "method": "POST",
            "purpose": "web-search",
            "query": trimmed,
            "numResults": num_results
        }),
    );

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "query": trimmed,
        "type": "auto",
        "numResults": num_results,
        "contents": { "highlights": true }
    });

    let resp = client
        .post("https://api.exa.ai/search")
        .header("x-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Exa request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let msg = format!("Exa error {status}: {text}");
        dev_log(
            &window,
            "response",
            json!({
                "endpoint": "https://api.exa.ai/search",
                "durationMs": now_ms().saturating_sub(start),
                "status": "error",
                "error": msg
            }),
        );
        return Err(msg);
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let results = data
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|r| {
            json!({
                "title": r.get("title").and_then(Value::as_str).unwrap_or(""),
                "url": r.get("url").and_then(Value::as_str).unwrap_or(""),
                "publishedDate": r.get("publishedDate").cloned().unwrap_or(Value::Null),
                "author": r.get("author").cloned().unwrap_or(Value::Null),
                "highlights": r.get("highlights").cloned().unwrap_or_else(|| json!([])),
                "summary": r.get("summary").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    dev_log(
        &window,
        "response",
        json!({
            "endpoint": "https://api.exa.ai/search",
            "durationMs": now_ms().saturating_sub(start),
            "resultCount": results.len(),
            "status": "success"
        }),
    );

    Ok(json!({ "results": results }))
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
    let filepath = find_chat_file(&app, &old_id).unwrap_or_else(|| dir.join(chat_file_name(&old_id)));
    let relocated = filepath.starts_with(private_dir(&app));
    if !filepath.exists() {
        let new_id = generate_chat_id();
        chat["id"] = Value::String(new_id.clone());
        let new_file = dir.join(chat_file_name(&new_id));
        write_chat_bundle(&new_file, &chat)?;
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
        if let Ok(disk_chat) = load_chat_from_file(&filepath) {
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
    write_chat_bundle(&filepath, &chat)?;
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
    load_chat_from_file(&filepath)
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
    remove_chat_bundle(&filepath)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn chat_rename(app: AppHandle, chat_id: String, new_title: String) -> Result<Value, String> {
    let Some(filepath) = find_chat_file(&app, &chat_id) else {
        return Err(format!("Chat not found: {chat_id}"));
    };
    let mut chat = load_chat_from_file(&filepath)?;
    chat["title"] = Value::String(new_title);
    write_chat_bundle(&filepath, &chat)?;
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
    move_chat_bundle(&src, &dst)?;
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
    let chat = load_chat_from_file(&src)?;
    let month = month_from_chat(&chat);
    let dst_dir = monthly_dir(&chats_dir(&app), &month);
    ensure_dir(&dst_dir)?;
    let dst = dst_dir.join(chat_file_name(&chat_id));
    move_chat_bundle(&src, &dst)?;
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
    let mut chat = load_chat_from_file(&filepath)?;
    chat["branchGroup"] = Value::String(group_id);
    write_chat_bundle(&filepath, &chat)?;
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
                current_model_load_cancel: Mutex::new(None),
                server_url: Mutex::new(url),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            chat_send,
            chat_analyze_image,
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
            analysis_import,
            analysis_list,
            analysis_build_chunks,
            analysis_create_run,
            analysis_list_runs,
            analysis_run_state,
            analysis_save_topic_result,
            analysis_save_error,
            analysis_load_topic_results,
            analysis_save_canon_batch,
            analysis_list_canon_batches,
            analysis_save_graph,
            analysis_append_log,
            analysis_paths,
            analysis_open_path,
            analysis_reset_topics,
            analysis_reset_canonization,
            get_models,
            load_model,
            exa_search,
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
