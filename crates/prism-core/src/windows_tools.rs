//! Discover tools even when Explorer still has the PATH from before setup.
use std::path::{Path, PathBuf};
use winreg::{enums::*, RegKey};

fn expand(value: &str) -> String {
    let input: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
    unsafe {
        use windows_sys::Win32::System::Environment::ExpandEnvironmentStringsW;
        let len = ExpandEnvironmentStringsW(input.as_ptr(), std::ptr::null_mut(), 0);
        if len == 0 {
            return value.into();
        }
        let mut output = vec![0u16; len as usize];
        let written = ExpandEnvironmentStringsW(input.as_ptr(), output.as_mut_ptr(), len);
        if written == 0 || written > len {
            return value.into();
        }
        String::from_utf16_lossy(&output[..written as usize - 1])
    }
}

fn directories() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    for (hive, key) in [
        (HKEY_CURRENT_USER, "Environment"),
        (
            HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
    ] {
        if let Ok(key) = RegKey::predef(hive).open_subkey(key) {
            if let Ok(path) = key.get_value::<String, _>("Path") {
                paths.extend(std::env::split_paths(&expand(&path)));
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(&local).join(r"Programs\MiKTeX\miktex\bin\x64"));
        paths.push(PathBuf::from(local).join(r"Microsoft\WinGet\Links"));
    }
    if let Some(programs) = std::env::var_os("ProgramFiles") {
        let programs = PathBuf::from(programs);
        paths.push(programs.join(r"MiKTeX\miktex\bin\x64"));
        if let Ok(entries) = std::fs::read_dir(programs.join("gs")) {
            for entry in entries.flatten() {
                paths.push(entry.path().join("bin"));
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir(r"C:\texlive") {
        for entry in entries.flatten() {
            paths.push(entry.path().join(r"bin\windows"));
        }
    }
    paths
}

pub(crate) fn find(name: &str) -> Option<PathBuf> {
    find_in(name, &directories())
}

fn find_in(name: &str, directories: &[PathBuf]) -> Option<PathBuf> {
    let executable = format!("{name}.exe");
    for dir in directories {
        let candidate = dir.join(&executable);
        if candidate.is_file() {
            return Some(candidate);
        }
        if name == "codex" {
            // npm's JS/cmd launcher wraps a native executable. Run that directly:
            // no cmd.exe quoting, Node dependency, or extra console window.
            if let Some(native) = npm_codex(dir) {
                return Some(native);
            }
        }
    }
    None
}

fn npm_codex(prefix: &Path) -> Option<PathBuf> {
    let package = prefix.join(r"node_modules\@openai\codex");
    for arch in ["x64", "arm64"] {
        let target = if arch == "x64" { "x86_64" } else { "aarch64" };
        for subdir in ["bin", "codex"] {
            let vendor = format!(r"vendor\{target}-pc-windows-msvc\{subdir}\codex.exe");
            for candidate in [
                package.join(&vendor),
                package
                    .join(format!(r"node_modules\@openai\codex-win32-{arch}"))
                    .join(&vendor),
                prefix
                    .join(format!(r"node_modules\@openai\codex-win32-{arch}"))
                    .join(&vendor),
            ] {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_native_npm_codex_in_a_path_with_spaces() {
        let temp = tempfile::tempdir().unwrap();
        let prefix = temp.path().join("Node installation");
        let native = prefix.join(r"node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\codex\codex.exe");
        std::fs::create_dir_all(native.parent().unwrap()).unwrap();
        std::fs::write(&native, b"fixture").unwrap();
        std::fs::write(prefix.join("codex.cmd"), b"fixture").unwrap();
        assert_eq!(find_in("codex", &[prefix]), Some(native));
    }

    #[test]
    fn preserves_directory_precedence_and_requires_a_file() {
        let temp = tempfile::tempdir().unwrap();
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        std::fs::create_dir_all(first.join("pdflatex.exe")).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let executable = second.join("pdflatex.exe");
        std::fs::write(&executable, b"fixture").unwrap();
        assert_eq!(find_in("pdflatex", &[first, second]), Some(executable));
    }
}
