//! Read-only discovery for project cards, including hidden compiler output.
use crate::{projects, Backend};
use serde_json::{json, Value};
use std::{fs, path::Path, time::UNIX_EPOCH};

pub(crate) fn discover(app: &Backend, project_id: &str) -> Result<Value, String> {
    let project = projects::get(app, project_id)?;
    let listing = projects::project_list(app.clone(), project_id.into())?;
    let paths: Vec<String> = listing["files"]
        .as_array()
        .ok_or("Invalid project listing")?
        .iter()
        .filter_map(|f| f["path"].as_str().map(str::to_owned))
        .collect();
    discover_paths(&project.root, paths)
}

fn discover_paths(root: &Path, mut paths: Vec<String>) -> Result<Value, String> {
    if let Ok(build) = projects::resolve(root, ".prism/build") {
        if build.is_dir() {
            for entry in fs::read_dir(build).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if entry.file_type().map_err(|e| e.to_string())?.is_file() {
                    paths.push(format!(
                        ".prism/build/{}",
                        entry.file_name().to_string_lossy()
                    ));
                }
            }
        }
    }
    let mut tex: Vec<_> = paths
        .iter()
        .filter(|p| {
            matches!(
                Path::new(p).extension().and_then(|s| s.to_str()),
                Some("tex" | "ltx")
            )
        })
        .cloned()
        .collect();
    tex.sort_by_key(|p| {
        (
            match p.as_str() {
                "main.tex" => 0,
                "document.tex" => 1,
                _ => 2,
            },
            p.clone(),
        )
    });
    let stems: Vec<_> = tex
        .iter()
        .filter_map(|p| Path::new(p).file_stem())
        .collect();
    let mut pdfs = Vec::new();
    for path in paths
        .into_iter()
        .filter(|p| p.to_lowercase().ends_with(".pdf"))
    {
        let Ok(file) = projects::resolve(root, &path) else {
            continue;
        };
        let Ok(meta) = fs::metadata(file) else {
            continue;
        };
        if !meta.is_file() || meta.len() == 0 {
            continue;
        }
        let modified = meta.modified().unwrap_or(UNIX_EPOCH);
        let rank = if path.starts_with(".prism/build/") {
            0
        } else if Path::new(&path)
            .file_stem()
            .is_some_and(|s| stems.contains(&s))
        {
            1
        } else if !path.contains('/') {
            2
        } else {
            3
        };
        let token = format!("{}:{modified:?}", meta.len());
        pdfs.push((rank, std::cmp::Reverse(modified), path, token));
    }
    pdfs.sort();
    let created_at = fs::metadata(root)
        .ok()
        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    Ok(
        json!({"createdAt":created_at,"pdfs":pdfs.into_iter().map(|(_,_,path,revision)| json!({"path":path,"revision":revision})).collect::<Vec<_>>(),"texFiles":tex}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovers_custom_names_build_outputs_and_pdf_only_projects() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join(".prism/build")).unwrap();
        for p in [
            "thesis.tex",
            "thesis.pdf",
            "reference.pdf",
            ".prism/build/thesis.pdf",
        ] {
            fs::write(d.path().join(p), b"content").unwrap();
        }
        let result = discover_paths(
            d.path(),
            vec![
                "thesis.tex".into(),
                "thesis.pdf".into(),
                "reference.pdf".into(),
            ],
        )
        .unwrap();
        assert_eq!(result["pdfs"][0]["path"], ".prism/build/thesis.pdf");
        assert_eq!(result["pdfs"][1]["path"], "thesis.pdf");
        assert_eq!(result["texFiles"][0], "thesis.tex");
        let token = result["pdfs"][0]["revision"].clone();
        fs::write(
            d.path().join(".prism/build/thesis.pdf"),
            b"changed contents",
        )
        .unwrap();
        assert_ne!(
            discover_paths(d.path(), vec![]).unwrap()["pdfs"][0]["revision"],
            token
        );
        fs::remove_dir_all(d.path().join(".prism")).unwrap();
        assert_eq!(
            discover_paths(d.path(), vec!["reference.pdf".into()]).unwrap()["pdfs"][0]["path"],
            "reference.pdf"
        );
    }
    #[cfg(unix)]
    #[test]
    fn ignores_symlinked_pdfs_and_build_directories() {
        let d = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.pdf"), b"secret").unwrap();
        fs::create_dir(d.path().join(".prism")).unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join(".prism/build")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.pdf"), d.path().join("link.pdf"))
            .unwrap();
        assert_eq!(
            discover_paths(d.path(), vec!["link.pdf".into()]).unwrap()["pdfs"],
            json!([])
        );
    }
}
