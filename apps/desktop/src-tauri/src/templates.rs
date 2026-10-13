//! Thin adapters for the local template library.
#[tauri::command]
pub async fn template_list(
    backend: tauri::State<'_, prism_core::Backend>,
) -> Result<prism_core::templates::TemplateLibrary, String> {
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || backend.template_list())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn template_create_project(
    backend: tauri::State<'_, prism_core::Backend>,
    id: String,
    revision: String,
    destination: String,
) -> Result<prism_core::templates::TemplateProject, String> {
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        backend.template_create_project(id, revision, destination)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn template_preview(
    backend: tauri::State<'_, prism_core::Backend>,
    id: String,
    revision: String,
    retry: bool,
) -> Result<Vec<u8>, String> {
    backend.template_preview(id, revision, retry).await
}
