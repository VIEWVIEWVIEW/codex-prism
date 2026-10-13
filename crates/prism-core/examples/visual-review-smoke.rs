#![allow(clippy::unwrap_used)]
//! Local-only backend for the WebKit visual-review smoke test. Uses a disposable
//! project and deterministic app-server fixture, never a user's agent account.
use prism_core::{Backend, BackendConfig, NoopEventSink};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    sync::Arc,
};
#[cfg(not(unix))]
fn main() {
    eprintln!("This WebKitGTK test fixture requires Unix.");
}
#[cfg(unix)]
#[tokio::main]
async fn main() {
    use std::os::unix::fs::PermissionsExt;
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path();
    let backend = Backend::new(
        BackendConfig {
            data_dir: dir.join("data"),
            home_dir: dir.join("home"),
            temp_dir: dir.join("tmp"),
        },
        Arc::new(NoopEventSink),
    )
    .unwrap();
    let root = dir.join("project");
    std::fs::create_dir(&root).unwrap();
    let source="\\documentclass{article}\n\\begin{document}\nOriginal passage for visual review.\n\nAnother unchanged paragraph.\n\\end{document}\n";
    std::fs::write(root.join("main.tex"), source).unwrap();
    let script = dir.join("agent");
    let fixture=include_str!("../tests/fixtures/app_server.py").replace(r#"(root / "main.tex").write_text("running edit")"#,"(root / \"main.tex\").write_text((root / \"main.tex\").read_text().replace(\"Original passage\",\"Updated passage\"))\n            complete()");
    std::fs::write(&script, fixture).unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
    backend
        .codex_set_path(script.to_string_lossy().into())
        .await
        .unwrap();
    let project = backend
        .project_register(root.to_string_lossy().into())
        .unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:19371").unwrap();
    println!("Visual smoke backend ready");
    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        let mut request = Vec::new();
        let mut buf = [0u8; 8192];
        let (header_end, length) = loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break (0, 0);
            }
            request.extend_from_slice(&buf[..n]);
            if let Some(pos) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..pos]);
                let length = headers
                    .lines()
                    .find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|v| v.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                break (pos + 4, length);
            }
        };
        while request.len() < header_end + length {
            let n = stream.read(&mut buf).unwrap();
            request.extend_from_slice(&buf[..n]);
        }
        let value: Value = serde_json::from_slice(&request[header_end..]).unwrap_or(json!({}));
        let command = value["command"].as_str().unwrap_or("");
        let args = &value["args"];
        let result: Result<Value, String> = match command {
            "performance" => {
                let variable = if args["name"] == "large" {
                    "PRISM_SMOKE_LARGE_PDF"
                } else {
                    "PRISM_SMOKE_LONG_PDF"
                };
                std::env::var(variable)
                    .map_err(|e| e.to_string())
                    .and_then(|path| {
                        std::fs::read(path)
                            .map(|b| json!(b))
                            .map_err(|e| e.to_string())
                    })
            }
            "fixture" => Ok(json!({"project":project,"source":source})),
            "edit" => {
                backend
                    .codex_send_with_document(
                        project.id.clone(),
                        None,
                        "edit".into(),
                        None,
                        None,
                        None,
                        Some("main.tex".into()),
                    )
                    .await
            }
            "project_register" => Ok(json!(project)),
            "project_service" => {
                backend
                    .project_service(
                        project.id.clone(),
                        args["operation"].as_str().unwrap().into(),
                        args["args"].clone(),
                    )
                    .await
            }
            "project_review" => backend.project_review(project.id.clone()),
            "project_resolve_review" => backend
                .project_resolve_review(
                    project.id.clone(),
                    args["path"].as_str().unwrap().into(),
                    args["undo"].as_bool().unwrap(),
                )
                .map(|_| Value::Null),
            "project_list" => backend.project_list(project.id.clone()),
            "project_read" => {
                backend.project_read(project.id.clone(), args["path"].as_str().unwrap().into())
            }
            "detect_texlive" => Ok(json!(backend.detect_texlive())),
            "plugin:event|listen" => Ok(json!(1)),
            _ => Ok(Value::Null),
        };
        let response = serde_json::to_vec(&match result {
            Ok(v) => json!({"value":v}),
            Err(e) => json!({"error":e}),
        })
        .unwrap();
        let headers=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",response.len());
        let _ = stream.write_all(headers.as_bytes());
        let _ = stream.write_all(&response);
    }
}
