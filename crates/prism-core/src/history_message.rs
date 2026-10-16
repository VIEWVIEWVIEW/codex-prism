//! Build history messages from a shortened request and immutable accepted bytes.
use std::collections::BTreeMap;

/// A single-line subject, bounded by Unicode characters and whole words when possible.
pub(crate) fn prompt_subject(prompt: &str) -> Option<String> {
    let clean = prompt.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        return None;
    }
    let prefix = "docs(agent): ";
    let limit = 100 - prefix.chars().count();
    let shortened = if clean.chars().count() <= limit {
        clean
    } else {
        let head: String = clean.chars().take(limit - 1).collect();
        let boundary = head.rfind(' ').unwrap_or(head.len());
        format!("{}…", &head[..boundary])
    };
    Some(format!("{prefix}{shortened}"))
}

fn compact(text: &str, limit: usize) -> String {
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.chars().count() <= limit {
        clean
    } else {
        format!(
            "{}…",
            clean
                .chars()
                .take(limit.saturating_sub(1))
                .collect::<String>()
        )
    }
}

fn section(text: &str, line: usize) -> Option<String> {
    text.lines()
        .take(line)
        .filter_map(|line| {
            let line = line.trim();
            ["part", "chapter", "section", "subsection", "subsubsection"]
                .iter()
                .find_map(|command| {
                    let rest = line
                        .strip_prefix(&format!("\\{command}"))?
                        .trim_start_matches('*')
                        .trim_start();
                    let rest = if rest.starts_with('[') {
                        rest.split_once(']')?.1.trim_start()
                    } else {
                        rest
                    };
                    let title = rest.strip_prefix('{')?.split_once('}')?.0;
                    Some(compact(title, 48))
                })
        })
        .last()
}

fn describe(path: &str, before: Option<&[u8]>, after: Option<&[u8]>) -> (String, String) {
    let action = match (before, after) {
        (None, _) => "add",
        (_, None) => "remove",
        _ => "revise",
    };
    let name = compact(path, 80);
    let old = before.unwrap_or_default();
    let new = after.unwrap_or_default();
    let text = std::str::from_utf8(old)
        .ok()
        .zip(std::str::from_utf8(new).ok());
    let binary = text.is_none() || old.contains(&0) || new.contains(&0);
    // Keep analysis bounded for large files and never interpret binary as prose.
    let Some((old_text, new_text)) = text.filter(|_| !binary && old.len() + new.len() <= 2_000_000)
    else {
        let kind = if binary { "asset" } else { "file" };
        return (
            format!("{action} {kind} {name}"),
            format!(
                "{name}: {action} {kind} ({} → {} bytes)",
                old.len(),
                new.len()
            ),
        );
    };
    let mut options = git2::DiffOptions::new();
    options.context_lines(0);
    let Ok(diff) = git2::Patch::from_buffers(old, None, new, None, Some(&mut options)) else {
        return (
            format!("{action} {name}"),
            format!("{name}: {action} ({} → {} bytes)", old.len(), new.len()),
        );
    };
    let mut added = 0;
    let mut removed = 0;
    let mut first_added = String::new();
    let mut first_removed = String::new();
    let mut sections = Vec::new();
    for index in 0..diff.num_hunks() {
        let Ok((hunk, count)) = diff.hunk(index) else {
            continue;
        };
        if path.ends_with(".tex") {
            let context = if hunk.new_lines() == 0 {
                section(old_text, hunk.old_start() as usize)
            } else {
                section(new_text, hunk.new_start() as usize)
                    .or_else(|| section(old_text, hunk.old_start() as usize))
            };
            if let Some(context) = context {
                if !sections.contains(&context) && sections.len() < 3 {
                    sections.push(context);
                }
            }
        }
        for index_in_hunk in 0..count {
            let Ok(line) = diff.line_in_hunk(index, index_in_hunk) else {
                continue;
            };
            let excerpt = compact(&String::from_utf8_lossy(line.content()), 160);
            match line.origin() {
                '+' => {
                    added += 1;
                    if first_added.is_empty() {
                        first_added = excerpt;
                    }
                }
                '-' => {
                    removed += 1;
                    if first_removed.is_empty() {
                        first_removed = excerpt;
                    }
                }
                _ => {}
            }
        }
    }
    let action = if action == "revise" {
        match (added, removed) {
            (0, _) => "remove text from",
            (_, 0) => "extend",
            _ => "revise",
        }
    } else {
        action
    };
    let target = if sections.is_empty() {
        name.clone()
    } else {
        sections.join(", ")
    };
    let excerpt = if first_added.is_empty() {
        &first_removed
    } else {
        &first_added
    };
    let subject = if excerpt.is_empty() {
        format!("{action} {target}")
    } else {
        format!("{action} {target}: {}", compact(excerpt, 56))
    };
    let mut detail = format!("{name}: {action} (+{added}/-{removed} lines)");
    if !sections.is_empty() {
        detail.push_str(&format!("\nSections: {}", sections.join(", ")));
    }
    if !first_removed.is_empty() {
        detail.push_str(&format!("\nBefore: {first_removed}"));
    }
    if !first_added.is_empty() {
        detail.push_str(&format!("\nAfter: {first_added}"));
    }
    (subject, detail)
}

pub(super) fn acceptance_message(
    before: &BTreeMap<String, Vec<u8>>,
    patch: &BTreeMap<String, Option<Vec<u8>>>,
) -> String {
    let summaries: Vec<_> = patch
        .iter()
        .filter(|(path, after)| before.get(*path).map(Vec::as_slice) != after.as_deref())
        .map(|(path, after)| describe(path, before.get(path).map(Vec::as_slice), after.as_deref()))
        .collect();
    let subject = summaries
        .iter()
        .take(2)
        .map(|(subject, _)| subject.as_str())
        .collect::<Vec<_>>()
        .join("; ");
    let suffix = if summaries.len() > 2 {
        format!(" (+{} files)", summaries.len() - 2)
    } else {
        String::new()
    };
    let details = summaries
        .iter()
        .map(|(_, detail)| detail.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    format!(
        "docs(agent): {}{suffix}\n\n{details}",
        compact(&subject, 100 - 13 - suffix.len())
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prompt_subjects_are_single_line_bounded_and_unicode_safe() {
        assert_eq!(
            prompt_subject("  Clarify\n the\tproof  ").as_deref(),
            Some("docs(agent): Clarify the proof")
        );
        assert_eq!(prompt_subject(" \n\t"), None);
        let subject = prompt_subject(&"Improve the explanation ".repeat(20)).unwrap();
        assert!(subject.chars().count() <= 100);
        assert!(
            subject.ends_with("explanation…")
                || subject.ends_with("the…")
                || subject.ends_with("Improve…")
        );
        let subject = prompt_subject(&"界".repeat(120)).unwrap();
        assert_eq!(subject.chars().count(), 100);
        assert!(subject.ends_with('…'));
    }

    #[test]
    fn distinguishes_edits_to_the_same_section_and_scopes_to_accepted_files() {
        let before = BTreeMap::from([
            (
                "main.tex".into(),
                b"\\section{Results}\nAccuracy was 80%.\n".to_vec(),
            ),
            ("private.tex".into(), b"Unaccepted content".to_vec()),
        ]);
        let patch =
            |text: &str| BTreeMap::from([("main.tex".into(), Some(text.as_bytes().to_vec()))]);
        let one = acceptance_message(&before, &patch("\\section{Results}\nAccuracy was 90%.\n"));
        let two = acceptance_message(&before, &patch("\\section{Results}\nAccuracy was 95%.\n"));
        assert!(one.starts_with("docs(agent): revise Results: Accuracy was 90%."));
        assert!(one.contains("Before: Accuracy was 80%."));
        assert!(!one.contains("private.tex"));
        assert_ne!(one.lines().next(), two.lines().next());
    }
    #[test]
    fn handles_additions_deletions_binary_and_unicode_without_raw_binary() {
        let before = BTreeMap::from([("old.tex".into(), "Ancienne méthode".as_bytes().to_vec())]);
        let patch = BTreeMap::from([
            ("old.tex".into(), None),
            ("new.bib".into(), Some(b"@article{new_reference,".to_vec())),
            ("plot.png".into(), Some(vec![0, 255, 1])),
        ]);
        let message = acceptance_message(&before, &patch);
        assert!(message.contains("remove"));
        assert!(message.contains("new_reference"));
        assert!(message.contains("plot.png: add asset"));
        assert!(message.lines().next().unwrap().chars().count() <= 100);
        assert!(message.contains("Ancienne méthode"));
    }
}
