use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

static INSTALLING: AtomicBool = AtomicBool::new(false);
static AVAILABLE_AT_START: Mutex<bool> = Mutex::new(false);
const REQUIRED_FILES: &[&str] = &[
    "program/soffice.com",
    "program/soffice.exe",
    "program/soffice.bin",
    "program/mergedlo.dll",
    "license.txt",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComponentRelease {
    version: String,
    url: String,
    sha256: String,
    bytes: u64,
    expanded_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeStatus {
    supported: bool,
    installed: bool,
    restart_required: bool,
    version: String,
    download_bytes: u64,
    installed_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    phase: &'static str,
    completed: u64,
    total: u64,
}

fn release() -> ComponentRelease {
    serde_json::from_str(include_str!("../../office-component.json"))
        .expect("Invalid pinned Office component")
}

fn component_root() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("LightPage-PDF/components/office"))
        .ok_or_else(|| "The local application data directory is unavailable".to_string())
}

fn is_complete(directory: &Path, component: &ComponentRelease) -> bool {
    fs::read_to_string(directory.join(".lightpage-component"))
        .is_ok_and(|hash| hash == component.sha256)
        && REQUIRED_FILES
            .iter()
            .all(|file| directory.join(file).is_file())
}

/// Resolve a verified per-user Windows component, with the bundled runtime as a legacy fallback.
pub fn office_executable(tools_root: &Path) -> PathBuf {
    if cfg!(windows) {
        let component = release();
        if let Ok(root) = component_root() {
            let directory = root.join(&component.version);
            if is_complete(&directory, &component) {
                return directory.join("program/soffice.com");
            }
        }
    }
    if cfg!(target_os = "macos") {
        tools_root.join("LibreOffice.app/Contents/MacOS/soffice")
    } else {
        tools_root.join("libreoffice/program/soffice.com")
    }
}

/// Record backend startup availability so a newly installed component can request a restart.
pub fn record_office_at_start(executable: &Path) {
    *AVAILABLE_AT_START.lock().unwrap() = executable.is_file();
}

/// Report local installation state without starting a download or changing the backend.
#[tauri::command]
pub fn get_office_component_status(app: AppHandle) -> Result<OfficeStatus, String> {
    let component = release();
    let supported = cfg!(all(target_os = "windows", target_arch = "x86_64"));
    let installed = if supported {
        let external = is_complete(&component_root()?.join(&component.version), &component);
        let bundled = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("runtime/tools/libreoffice/program/soffice.com")
            .is_file();
        external || bundled
    } else {
        false
    };
    Ok(OfficeStatus {
        supported,
        installed,
        restart_required: installed && !*AVAILABLE_AT_START.lock().unwrap(),
        version: component.version,
        download_bytes: component.bytes,
        installed_bytes: component.expanded_bytes,
    })
}

struct InstallGuard;

impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::Release);
    }
}

fn trusted_download_url(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}

fn verify_archive(path: &Path, component: &ComponentRelease) -> Result<(), String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() != component.bytes {
        return Err("The component download is incomplete. Please retry.".into());
    }
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    let hash: String = digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    if hash != component.sha256 {
        return Err("The component checksum did not match. Please retry.".into());
    }
    Ok(())
}

fn safe_entry_path(name: &str) -> Result<PathBuf, String> {
    let path = Path::new(name);
    if name.contains(['\\', ':', '\0'])
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("The component archive contains an unsafe path".into());
    }
    for part in name.trim_end_matches('/').split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part.ends_with(['.', ' '])
            || matches!(
                stem.as_str(),
                "CON"
                    | "PRN"
                    | "AUX"
                    | "NUL"
                    | "COM1"
                    | "COM2"
                    | "COM3"
                    | "COM4"
                    | "COM5"
                    | "COM6"
                    | "COM7"
                    | "COM8"
                    | "COM9"
                    | "LPT1"
                    | "LPT2"
                    | "LPT3"
                    | "LPT4"
                    | "LPT5"
                    | "LPT6"
                    | "LPT7"
                    | "LPT8"
                    | "LPT9"
            )
        {
            return Err("The component archive contains an unsupported filename".into());
        }
    }
    Ok(path.to_path_buf())
}

fn extract_archive(
    path: &Path,
    destination: &Path,
    component: &ComponentRelease,
    mut progress: impl FnMut(u64),
) -> Result<(), String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() > 20000 {
        return Err("Too many files in the component archive".into());
    }
    let mut expanded = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = safe_entry_path(entry.name())?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Links are not allowed in the component archive".into());
        }
        expanded = expanded
            .checked_add(entry.size())
            .ok_or("Component size overflow")?;
        if expanded > component.expanded_bytes {
            return Err("The component exceeds its expected size".into());
        }
        let target = destination.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(target).map_err(|error| error.to_string())?;
        } else {
            fs::create_dir_all(target.parent().ok_or("Invalid component path")?)
                .map_err(|error| error.to_string())?;
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
                .map_err(|error| error.to_string())?;
            let expected = entry.size();
            let actual = std::io::copy(&mut entry.by_ref().take(expected + 1), &mut output)
                .map_err(|error| error.to_string())?;
            if actual != expected {
                return Err("Invalid expanded component size".into());
            }
        }
        progress(expanded);
    }
    if expanded != component.expanded_bytes
        || !REQUIRED_FILES
            .iter()
            .all(|file| destination.join(file).is_file())
    {
        return Err("The component archive is missing required files".into());
    }
    Ok(())
}

fn commit_archive(
    archive: &Path,
    root: &Path,
    component: &ComponentRelease,
    progress: impl FnMut(u64),
) -> Result<(), String> {
    verify_archive(archive, component)?;
    let stage = tempfile::Builder::new()
        .prefix(".office-install-")
        .tempdir_in(root)
        .map_err(|error| error.to_string())?;
    extract_archive(archive, stage.path(), component, progress)?;
    fs::write(stage.path().join(".lightpage-component"), &component.sha256)
        .map_err(|error| error.to_string())?;
    let destination = root.join(&component.version);
    if is_complete(&destination, component) {
        return Ok(());
    }
    if destination.exists() {
        if fs::read_to_string(destination.join(".lightpage-component"))
            .ok()
            .as_deref()
            != Some(&component.sha256)
        {
            return Err(
                "The Office component destination is occupied by an unrecognized directory".into(),
            );
        }
        let backup = tempfile::Builder::new()
            .prefix(".office-backup-")
            .tempdir_in(root)
            .map_err(|error| error.to_string())?;
        let previous = backup.path().join("previous");
        fs::rename(&destination, &previous).map_err(|error| error.to_string())?;
        if let Err(error) = fs::rename(stage.path(), &destination) {
            if fs::rename(&previous, &destination).is_err() {
                return Err(format!(
                    "Could not restore the previous component; it is retained at {}: {error}",
                    backup.keep().display()
                ));
            }
            return Err(error.to_string());
        }
        return Ok(());
    }
    fs::rename(stage.path(), destination).map_err(|error| error.to_string())?;
    Ok(())
}

async fn download_archive(
    component: &ComponentRelease,
    root: &Path,
    mut progress: impl FnMut(u64),
) -> Result<tempfile::NamedTempFile, String> {
    let mut archive = tempfile::NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
    let client = reqwest::Client::builder()
        .http1_only()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .timeout(Duration::from_secs(1800))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !trusted_download_url(attempt.url()) {
                attempt.error("Untrusted component redirect")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|error| error.to_string())?;
    let url = url::Url::parse(&component.url).map_err(|error| error.to_string())?;
    if !trusted_download_url(&url) {
        return Err("Untrusted component download URL".into());
    }
    let mut response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, "LightPage-PDF")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let mut downloaded = 0_u64;
    let mut last_progress = Instant::now();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        downloaded += chunk.len() as u64;
        if downloaded > component.bytes {
            return Err("The component download exceeds its expected size".into());
        }
        archive
            .write_all(&chunk)
            .map_err(|error| error.to_string())?;
        if last_progress.elapsed() >= Duration::from_millis(100) || downloaded == component.bytes {
            progress(downloaded);
            last_progress = Instant::now();
        }
    }
    archive.flush().map_err(|error| error.to_string())?;
    Ok(archive)
}

/// Download only the pinned Windows component, verify it, and atomically publish its installation.
#[tauri::command]
pub async fn install_office_component(app: AppHandle) -> Result<OfficeStatus, String> {
    if !cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        return Err("This component is available on Windows x64".into());
    }
    INSTALLING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "The Office component is already being installed")?;
    let _guard = InstallGuard;
    let component = release();
    let root = component_root()?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    if is_complete(&root.join(&component.version), &component) {
        return get_office_component_status(app);
    }
    let archive = download_archive(&component, &root, |completed| {
        let _ = app.emit(
            "office-component-progress",
            InstallProgress {
                phase: "download",
                completed,
                total: component.bytes,
            },
        );
    })
    .await?;
    let progress_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = progress_app.emit(
            "office-component-progress",
            InstallProgress {
                phase: "verify",
                completed: 0,
                total: 0,
            },
        );
        let mut last_progress = Instant::now();
        commit_archive(archive.path(), &root, &component, |completed| {
            if last_progress.elapsed() < Duration::from_millis(100)
                && completed != component.expanded_bytes
            {
                return;
            }
            last_progress = Instant::now();
            let _ = progress_app.emit(
                "office-component-progress",
                InstallProgress {
                    phase: "extract",
                    completed,
                    total: component.expanded_bytes,
                },
            );
        })
    })
    .await
    .map_err(|error| error.to_string())??;
    get_office_component_status(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;

    fn fixture(directory: &Path, entries: &[(&str, &[u8])]) -> (PathBuf, ComponentRelease) {
        let path = directory.join("component.zip");
        let mut writer = zip::ZipWriter::new(File::create(&path).unwrap());
        for (name, bytes) in entries {
            writer
                .start_file(
                    *name,
                    SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
        let bytes = fs::read(&path).unwrap();
        let sha256 = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        (
            path,
            ComponentRelease {
                version: "test-version".into(),
                url: String::new(),
                sha256,
                bytes: bytes.len() as u64,
                expanded_bytes: entries.iter().map(|(_, bytes)| bytes.len() as u64).sum(),
            },
        )
    }

    #[test]
    fn rejects_paths_that_escape_or_alias_windows_files() {
        for name in [
            "../outside",
            "/absolute",
            "C:/outside",
            "a/../../outside",
            "a\\outside",
            "a:stream",
            "CON.txt",
            "a/COM1",
            "a/space ",
            "a/dot.",
        ] {
            assert!(safe_entry_path(name).is_err(), "{name}");
        }
        assert_eq!(
            safe_entry_path("program/soffice.com").unwrap(),
            PathBuf::from("program/soffice.com")
        );
    }

    #[test]
    fn installs_complete_archive_and_preserves_it_on_bad_retry() {
        let temporary = tempfile::tempdir().unwrap();
        let entries: Vec<_> = REQUIRED_FILES
            .iter()
            .map(|name| (*name, b"test".as_slice()))
            .collect();
        let (archive, component) = fixture(temporary.path(), &entries);
        commit_archive(&archive, temporary.path(), &component, |_| {}).unwrap();
        let destination = temporary.path().join(&component.version);
        assert!(is_complete(&destination, &component));
        commit_archive(&archive, temporary.path(), &component, |_| {}).unwrap();
        fs::write(&archive, b"incomplete download").unwrap();
        assert!(commit_archive(&archive, temporary.path(), &component, |_| {}).is_err());
        assert!(is_complete(&destination, &component));
        assert!(!fs::read_dir(temporary.path()).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".office-install-")));
    }

    #[test]
    fn rejects_checksum_mismatch_before_creating_installation() {
        let temporary = tempfile::tempdir().unwrap();
        let (archive, mut component) =
            fixture(temporary.path(), &[("program/soffice.com", b"test")]);
        component.sha256 = "0".repeat(64);
        assert!(
            commit_archive(&archive, temporary.path(), &component, |_| {})
                .unwrap_err()
                .contains("checksum")
        );
        assert!(!temporary.path().join(&component.version).exists());
    }

    #[test]
    fn repairs_only_a_recognized_incomplete_installation() {
        let temporary = tempfile::tempdir().unwrap();
        let entries: Vec<_> = REQUIRED_FILES
            .iter()
            .map(|name| (*name, b"test".as_slice()))
            .collect();
        let (archive, component) = fixture(temporary.path(), &entries);
        let destination = temporary.path().join(&component.version);
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"unrecognized content").unwrap();
        assert!(commit_archive(&archive, temporary.path(), &component, |_| {}).is_err());
        assert_eq!(
            fs::read(destination.join("keep.txt")).unwrap(),
            b"unrecognized content"
        );
        fs::write(destination.join(".lightpage-component"), &component.sha256).unwrap();
        commit_archive(&archive, temporary.path(), &component, |_| {}).unwrap();
        assert!(is_complete(&destination, &component));
    }

    #[test]
    fn rejects_traversal_missing_files_conflicts_and_expansion_overflow() {
        for entries in [
            vec![("../outside", b"test".as_slice())],
            vec![("program/soffice.com", b"test".as_slice())],
            vec![
                ("program", b"test".as_slice()),
                ("program/soffice.com", b"test".as_slice()),
            ],
        ] {
            let temporary = tempfile::tempdir().unwrap();
            let (archive, component) = fixture(temporary.path(), &entries);
            assert!(commit_archive(&archive, temporary.path(), &component, |_| {}).is_err());
            assert!(!temporary.path().join(&component.version).exists());
        }
        let temporary = tempfile::tempdir().unwrap();
        let (archive, mut component) =
            fixture(temporary.path(), &[("program/soffice.com", b"test")]);
        component.expanded_bytes = 1;
        assert!(
            commit_archive(&archive, temporary.path(), &component, |_| {})
                .unwrap_err()
                .contains("expected size")
        );
    }

    #[test]
    fn rejects_symbolic_links() {
        let temporary = tempfile::tempdir().unwrap();
        let archive = temporary.path().join("link.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
        writer
            .add_symlink(
                "program/link",
                "../../outside",
                SimpleFileOptions::default(),
            )
            .unwrap();
        writer.finish().unwrap();
        let stage = temporary.path().join("stage");
        fs::create_dir(&stage).unwrap();
        assert!(extract_archive(&archive, &stage, &release(), |_| {})
            .unwrap_err()
            .contains("Links"));
    }

    #[test]
    fn only_accepts_pinned_https_release_hosts() {
        for url in [
            "http://github.com/file",
            "https://github.com.evil.test/file",
            "https://user@github.com/file",
            "https://example.com/file",
        ] {
            assert!(!trusted_download_url(&url::Url::parse(url).unwrap()));
        }
        let component = release();
        assert!(trusted_download_url(
            &url::Url::parse(&component.url).unwrap()
        ));
        assert_eq!(component.sha256.len(), 64);
        assert!(component
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit()));
        assert!(component.bytes > 0 && component.expanded_bytes > component.bytes);
    }

    #[test]
    #[ignore = "requires LIGHTPAGE_OFFICE_ARCHIVE pointing to the release ZIP"]
    fn installs_actual_release_archive() {
        let archive = PathBuf::from(
            std::env::var_os("LIGHTPAGE_OFFICE_ARCHIVE").expect("Set LIGHTPAGE_OFFICE_ARCHIVE"),
        );
        let root = tempfile::tempdir().unwrap();
        let component = release();
        commit_archive(&archive, root.path(), &component, |_| {}).unwrap();
        assert!(is_complete(
            &root.path().join(&component.version),
            &component
        ));
    }

    #[test]
    #[ignore = "downloads the public release with the application's native HTTP client"]
    fn public_release_download_has_the_pinned_checksum() {
        let root = tempfile::tempdir().unwrap();
        let component = release();
        let mut reported = 0;
        let archive = tauri::async_runtime::block_on(download_archive(
            &component,
            root.path(),
            |completed| {
                assert!(completed >= reported && completed <= component.bytes);
                reported = completed;
            },
        ))
        .unwrap();
        assert_eq!(reported, component.bytes);
        verify_archive(archive.path(), &component).unwrap();
    }
}
