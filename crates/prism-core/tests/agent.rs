//! Unix protocol fixtures use python3, not a real Codex installation or credentials.
#![cfg(unix)]
use prism_core::{Backend, BackendConfig, BackendEvent, RecordingEventSink};
use serde_json::{json, Value};
use std::{fs, os::unix::fs::PermissionsExt, sync::Arc, time::Duration};

async fn setup() -> (
    tempfile::TempDir,
    Backend,
    prism_core::projects::Project,
    Arc<RecordingEventSink>,
) {
    let dir = tempfile::tempdir().unwrap();
    let events = Arc::new(RecordingEventSink::default());
    let backend = Backend::new(
        BackendConfig {
            data_dir: dir.path().join("data"),
            home_dir: dir.path().join("home"),
            temp_dir: dir.path().join("tmp"),
        },
        events.clone(),
    )
    .unwrap();
    let script = dir.path().join("fake-codex");
    fs::write(&script, include_str!("fixtures/app_server.py")).unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    backend
        .codex_set_path(script.to_string_lossy().into())
        .await
        .unwrap();
    let root = dir.path().join("project");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("main.tex"), "original").unwrap();
    let p = backend
        .project_register(root.to_string_lossy().into())
        .unwrap();
    (dir, backend, p, events)
}
async fn event(events: &RecordingEventSink, method: &str) -> Value {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            for event in events.take() {
                if let BackendEvent::Agent(v) = event {
                    if v["method"] == method {
                        return v;
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}
async fn send(backend: &Backend, id: &str, prompt: &str) -> Result<Value, String> {
    backend
        .codex_send(id.into(), None, prompt.into(), None, None, None)
        .await
}
#[tokio::test]
async fn agent_streams_approvals_and_persists_sessions_and_reviews() {
    let (dir, backend, p, events) = setup().await;
    assert!(
        !dir.path().join("server.pid").exists(),
        "startup must be lazy"
    );
    let status = backend.codex_status().await.unwrap();
    assert_eq!(status["version"], "prism-test-server 1");
    let turn = send(&backend, &p.id, "approval").await.unwrap();
    assert_eq!(turn["threadId"], "thread-1");
    let approval = event(&events, "item/commandExecution/requestApproval").await;
    assert_eq!(approval["id"], 900);
    assert!(backend
        .project_write(p.id.clone(), "new.tex".into(), vec![], None)
        .is_err());
    backend
        .codex_respond(json!(900), json!({"decision":"accept"}))
        .await
        .unwrap();
    event(&events, "turn/completed").await;
    let review = backend.project_review(p.id.clone()).unwrap();
    assert_eq!(review["active"], false);
    assert_eq!(review["changes"][0]["newContent"], "approved edit");
    assert!(backend.codex_respond(json!(900), json!({})).await.is_err());
    backend
        .project_resolve_review(p.id.clone(), "main.tex".into(), true)
        .unwrap();
    assert_eq!(
        fs::read_to_string(p.root.join("main.tex")).unwrap(),
        "original"
    );
    assert_eq!(
        backend.codex_sessions(p.id).await.unwrap()[0]["id"],
        "thread-1"
    );
    backend.shutdown().await;
    let requests = fs::read_to_string(dir.path().join("requests.jsonl")).unwrap();
    assert!(requests.contains("workspace-write"));
    assert!(requests.contains("on-request"));
    assert!(requests.contains("\"id\": 900, \"result\""));
}
#[tokio::test]
async fn rejected_start_and_process_exit_release_the_review_lock() {
    let (_dir, backend, p, events) = setup().await;
    fs::write(p.root.join("fail-start"), "").unwrap();
    assert!(send(&backend, &p.id, "reject")
        .await
        .unwrap_err()
        .contains("fixture start rejected"));
    assert_eq!(
        backend.project_review(p.id.clone()).unwrap()["active"],
        false
    );
    fs::remove_file(p.root.join("fail-start")).unwrap();
    assert!(send(&backend, &p.id, "exit").await.is_err());
    event(&events, "connection/closed").await;
    assert_eq!(backend.project_review(p.id).unwrap()["active"], false);
    backend.shutdown().await;
}
#[tokio::test]
async fn shutdown_stops_active_turn_and_reaps_process() {
    let (dir, backend, p, events) = setup().await;
    send(&backend, &p.id, "running").await.unwrap();
    event(&events, "item/agentMessage/delta").await;
    let pid = fs::read_to_string(dir.path().join("server.pid")).unwrap();
    tokio::time::timeout(Duration::from_secs(5), backend.shutdown())
        .await
        .unwrap();
    backend.shutdown().await;
    assert!(!std::process::Command::new("/bin/kill")
        .args(["-0", &pid])
        .output()
        .unwrap()
        .status
        .success());
    let review: Value = serde_json::from_slice(
        &fs::read(dir.path().join(format!("data/review-{}.json", p.id))).unwrap(),
    )
    .unwrap();
    assert_eq!(review["active"], false);
    assert!(backend.codex_status().await.is_err());
}
#[tokio::test]
async fn shutdown_cancels_an_unanswered_agent_request() {
    let (_dir, backend, p, _events) = setup().await;
    let running = backend.clone();
    let request = tokio::spawn(async move { send(&running, &p.id, "hang-request").await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    tokio::time::timeout(Duration::from_secs(5), backend.shutdown())
        .await
        .unwrap();
    assert!(request.await.unwrap().is_err());
}

#[tokio::test]
async fn prompt_option_records_only_user_text_and_applies_to_future_turns() {
    for enabled in [false, true] {
        let (_dir, backend, p, events) = setup().await;
        backend
            .project_service(p.id.clone(), "history_init".into(), json!({}))
            .await
            .unwrap();
        let status = backend
            .project_service(p.id.clone(), "history_status".into(), json!({}))
            .await
            .unwrap();
        assert_eq!(status["includePrompt"], false);
        backend
            .project_service(
                p.id.clone(),
                "history_set_prompt".into(),
                json!({"enabled":enabled}),
            )
            .await
            .unwrap();
        backend
            .codex_send_with_history_prompt(
                p.id.clone(),
                None,
                "attachment body that must not enter a commit".into(),
                None,
                None,
                None,
                None,
                Some("Improve this passage".into()),
            )
            .await
            .unwrap();
        // Switching the option during a turn must not retroactively change it.
        backend
            .project_service(
                p.id.clone(),
                "history_set_prompt".into(),
                json!({"enabled":!enabled}),
            )
            .await
            .unwrap();
        backend
            .codex_control(
                p.id.clone(),
                "thread-1".into(),
                "turn-1".into(),
                Some("Keep it short".into()),
            )
            .await
            .unwrap();
        backend
            .codex_control(p.id.clone(), "thread-1".into(), "turn-1".into(), None)
            .await
            .unwrap();
        event(&events, "turn/completed").await;
        let review = backend.project_review(p.id.clone()).unwrap();
        backend
            .project_resolve_review_batch(
                p.id.clone(),
                vec!["main.tex".into()],
                false,
                review["revision"].as_str().map(str::to_owned),
            )
            .await
            .unwrap();
        let commits = backend
            .project_service(p.id.clone(), "history_list".into(), json!({}))
            .await
            .unwrap();
        let message = commits[0]["message"].as_str().unwrap();
        assert_eq!(message.contains("Improve this passage"), enabled);
        assert_eq!(message.contains("Keep it short"), enabled);
        assert!(!message.contains("attachment body"));
        backend.shutdown().await;
    }
}
