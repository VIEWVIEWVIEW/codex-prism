//! Literal LaTeX figure dependencies for document history. Never executes TeX.
use super::Inputs;
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};

fn group(text: &str, pos: &mut usize, open: u8, close: u8) -> Option<String> {
    let bytes = text.as_bytes();
    while bytes.get(*pos).is_some_and(u8::is_ascii_whitespace) {
        *pos += 1;
    }
    if bytes.get(*pos) != Some(&open) {
        return None;
    }
    *pos += 1;
    let start = *pos;
    let mut depth = 1;
    while let Some(&b) = bytes.get(*pos) {
        *pos += 1;
        if b == open {
            depth += 1;
        }
        if b == close {
            depth -= 1;
        }
        if depth == 0 {
            return Some(text[start..*pos - 1].trim().to_owned());
        }
    }
    None
}

fn commands(bytes: &[u8]) -> Vec<(String, String)> {
    let source = String::from_utf8_lossy(bytes);
    let mut text = String::new();
    for line in source.lines() {
        let mut slash = false;
        for c in line.chars() {
            if c == '%' && !slash {
                break;
            }
            text.push(c);
            slash = c == '\\' && !slash;
        }
        text.push('\n');
    }
    let bytes = text.as_bytes();
    let mut pos = 0;
    let mut result = Vec::new();
    while pos < bytes.len() {
        if bytes[pos] != b'\\' {
            pos += 1;
            continue;
        }
        pos += 1;
        let start = pos;
        while bytes.get(pos).is_some_and(u8::is_ascii_alphabetic) {
            pos += 1;
        }
        let name = &text[start..pos];
        if !matches!(
            name,
            "includegraphics" | "graphicspath" | "input" | "include"
        ) {
            continue;
        }
        if bytes.get(pos) == Some(&b'*') {
            pos += 1;
        }
        while group(&text, &mut pos, b'[', b']').is_some() {}
        if let Some(value) = group(&text, &mut pos, b'{', b'}') {
            result.push((name.to_owned(), value));
        }
    }
    result
}

fn relative(path: &Path) -> Result<String, String> {
    let mut clean = PathBuf::new();
    for part in path.components() {
        match part {
            Component::Normal(p) => clean.push(p),
            Component::CurDir => {}
            Component::ParentDir if clean.pop() => {}
            _ => {
                return Err(format!(
                    "Figure path is outside the project: {}",
                    path.display()
                ))
            }
        }
    }
    let name = clean.to_string_lossy().replace('\\', "/");
    if super::internal(&name) || name.split('/').any(|p| p.starts_with('.')) {
        return Err(format!("Figure path uses an excluded directory: {name}"));
    }
    Ok(name)
}

/// Resolve literal references; macro-computed filenames remain TeX's responsibility.
pub(super) fn collect(root: &str, files: &Inputs, seeds: Vec<String>) -> Result<Inputs, String> {
    let parsed: std::collections::BTreeMap<_, _> = files
        .iter()
        .filter(|(p, _)| p.ends_with(".tex"))
        .map(|(p, bytes)| (p.clone(), commands(bytes)))
        .collect();
    let mut directories = vec![String::new()];
    for list in parsed.values() {
        for (command, value) in list {
            if command == "graphicspath" {
                let mut pos = 0;
                while let Some(dir) = group(value, &mut pos, b'{', b'}') {
                    directories.push(dir);
                }
            }
        }
    }
    let mut pending = seeds;
    let mut visited = BTreeSet::new();
    let mut result = Inputs::new();
    while let Some(source) = pending.pop() {
        if !visited.insert(source.clone()) {
            continue;
        }
        let Some(list) = parsed.get(&source) else {
            continue;
        };
        for (command, value) in list {
            if value.contains(['\\', '#', '{', '}']) || value.is_empty() {
                continue;
            }
            if command == "input" || command == "include" {
                let name = if Path::new(value).extension().is_none() {
                    format!("{value}.tex")
                } else {
                    value.clone()
                };
                for base in [
                    Path::new(""),
                    Path::new(&source).parent().unwrap_or(Path::new("")),
                ] {
                    if let Ok(name) = relative(&base.join(&name)) {
                        if parsed.contains_key(&name) {
                            pending.push(name);
                            break;
                        }
                    }
                }
                continue;
            }
            if command != "includegraphics" {
                continue;
            }
            // Absolute and escaping references must never stage external files.
            relative(Path::new(value))?;
            let extensions: &[&str] = if Path::new(value).extension().is_some() {
                &[""]
            } else {
                &["pdf", "png", "jpg", "jpeg", "eps", "ps"]
            };
            let mut found = None;
            let parent = Path::new(&source).parent().unwrap_or(Path::new(""));
            'search: for directory in directories
                .iter()
                .map(Path::new)
                .chain(std::iter::once(parent))
            {
                if directory.to_string_lossy().contains('\\') {
                    continue;
                }
                for extension in extensions {
                    let path = directory.join(value);
                    let path = if extension.is_empty() {
                        path
                    } else {
                        path.with_extension(extension)
                    };
                    let name = relative(&path)?;
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if !matches!(
                        ext.as_str(),
                        "pdf" | "png" | "jpg" | "jpeg" | "eps" | "ps" | "svg" | "webp"
                    ) {
                        continue;
                    }
                    // Do not capture a document including its own compiled output.
                    // Other PDFs may be figures with their own TeX sources.
                    if ext == "pdf" && path.with_extension("tex").to_string_lossy() == source {
                        continue;
                    }
                    let resolved = crate::projects::resolve(Path::new(root), &name)?;
                    if let Some(bytes) = files.get(&name) {
                        found = Some((name, bytes.clone()));
                        break 'search;
                    }
                    if resolved.is_file() {
                        found = Some((name, std::fs::read(resolved).map_err(|e| e.to_string())?));
                        break 'search;
                    }
                }
            }
            let (name, bytes) = found.ok_or_else(|| format!("Cannot record figure '{value}' referenced by {source}: missing or excluded project asset"))?;
            result.insert(name, bytes);
        }
    }
    Ok(result)
}
