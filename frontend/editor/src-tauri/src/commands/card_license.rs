use crate::card_license::{verified_payload, LicenseStatus, SignedAuthorization, SOFTWARE_ID};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

const VERIFY_URL: &str = "https://lic.supervere.com/api/verify";
const CACHE_FILE: &str = "lightpage-card-license.json";
static LICENSE_LOCK: Mutex<()> = Mutex::const_new(());
static MACHINE_ID: OnceLock<String> = OnceLock::new();

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn usable_identity(value: &str) -> Option<String> {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || [
            "default string",
            "to be filled by o.e.m.",
            "not specified",
            "none",
        ]
        .contains(&lower.as_str())
        || lower
            .chars()
            .all(|character| character == '0' || character == '-')
        || lower
            .chars()
            .all(|character| character == 'f' || character == '-')
    {
        None
    } else {
        Some(value.into())
    }
}

#[cfg(target_os = "windows")]
fn hardware_identity() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID",
        ])
        .creation_flags(0x08000000)
        .output()
        .ok();
    if let Some(output) = output.filter(|output| output.status.success()) {
        if let Some(identity) = usable_identity(&String::from_utf8_lossy(&output.stdout)) {
            return Some(identity);
        }
    }
    let output = std::process::Command::new("reg.exe")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| line.contains("MachineGuid"))
        .and_then(|line| line.split_whitespace().last())
        .and_then(usable_identity)
}

#[cfg(target_os = "linux")]
fn hardware_identity() -> Option<String> {
    ["/sys/class/dmi/id/product_uuid", "/etc/machine-id"]
        .iter()
        .find_map(|path| {
            fs::read_to_string(path)
                .ok()
                .and_then(|value| usable_identity(&value))
        })
}

#[cfg(target_os = "macos")]
fn hardware_identity() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| line.contains("IOPlatformUUID"))
        .and_then(|line| line.split('"').nth(3))
        .and_then(usable_identity)
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn hardware_identity() -> Option<String> {
    None
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let parent = path.parent().ok_or("授权存储路径无效")?;
    fs::create_dir_all(parent).map_err(|_| "无法创建授权存储目录")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法写入授权缓存")?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "无法保存授权缓存")?;
    file.persist(path).map_err(|_| "无法保存授权缓存")?;
    Ok(())
}

fn installation_identity(directory: &Path) -> Result<String, String> {
    let path = directory.join("lightpage-install-id");
    match fs::read_to_string(&path) {
        Ok(value) => usable_identity(&value).ok_or("本机标识损坏，请恢复授权数据目录".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let identity = uuid::Uuid::new_v4().to_string();
            atomic_write(&path, identity.as_bytes())?;
            Ok(identity)
        }
        Err(_) => Err("无法读取本机授权标识".into()),
    }
}

fn hash_identity(source: &str) -> String {
    let hash: String = Sha256::digest(source.trim().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect();
    hash[..32].to_string()
}

fn machine_id(directory: &Path) -> Result<String, String> {
    if let Some(identity) = MACHINE_ID.get() {
        return Ok(identity.clone());
    }
    // Devices without a hardware identifier get their own persisted installation identity.
    let source = hardware_identity()
        .map(Ok)
        .unwrap_or_else(|| installation_identity(directory))?;
    let identity = hash_identity(&source);
    let _ = MACHINE_ID.set(identity.clone());
    Ok(identity)
}

/// Verifies a cache in the caller's application data directory without accessing the network.
pub(super) fn saved_state(directory: &Path) -> Result<LicenseStatus, String> {
    let machine = machine_id(directory)?;
    let bytes = match fs::read(directory.join(CACHE_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LicenseStatus::inactive(
                machine,
                "请输入轻页 PDF 卡密激活此设备",
            ))
        }
        Err(_) => return Err("无法读取授权缓存，请检查数据目录权限".into()),
    };
    let authorization: SignedAuthorization = match serde_json::from_slice(&bytes) {
        Ok(authorization) => authorization,
        Err(_) => {
            return Ok(LicenseStatus::inactive(
                machine,
                "授权缓存损坏，请重新联网激活",
            ))
        }
    };
    Ok(
        match verified_payload(&authorization, &machine, None, None) {
            Ok(payload) => {
                LicenseStatus::from_payload(payload, authorization.last_verified_at, now_secs())
            }
            Err(message) => LicenseStatus::inactive(machine, message),
        },
    )
}

fn clear_saved(directory: &Path) -> Result<(), String> {
    match fs::remove_file(directory.join(CACHE_FILE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("无法清除本机授权缓存".into()),
    }
}

#[derive(Deserialize)]
struct VerifyResponse {
    success: bool,
    msg: Option<String>,
    payload: Option<String>,
    signature: Option<String>,
}

async fn request_verification(
    key: &str,
    machine: &str,
    nonce: &str,
) -> Result<VerifyResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化授权连接")?;
    let response = client
        .post(VERIFY_URL)
        .json(&serde_json::json!({
            "license_key": key, "machine_id": machine, "nonce": nonce, "software_id": SOFTWARE_ID,
        }))
        .send()
        .await
        .map_err(|_| "无法连接验证服务器，请检查网络后重试")?;
    if !response.status().is_success() {
        return Err("验证服务暂时不可用，请稍后重试".into());
    }
    response
        .json()
        .await
        .map_err(|_| "验证服务器返回了无效响应".into())
}

/// Reads and verifies only local signed authorization; hardware discovery runs off the UI thread.
#[tauri::command]
pub async fn card_license_state(app: AppHandle) -> Result<LicenseStatus, String> {
    let _guard = LICENSE_LOCK.lock().await;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法获取授权存储目录")?;
    tauri::async_runtime::spawn_blocking(move || saved_state(&directory))
        .await
        .map_err(|_| "无法检查本机授权")?
}

/// Activates a supplied card or revalidates the saved card. Failed replacements preserve a valid existing authorization.
#[tauri::command]
pub async fn card_license_verify(
    app: AppHandle,
    license_key: Option<String>,
) -> Result<LicenseStatus, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法获取授权存储目录")?;
    verify_in(directory, license_key).await
}

/// Uses the same signed activation and atomic cache policy for the host and a developer protocol probe.
pub(super) async fn verify_in(
    directory: std::path::PathBuf,
    license_key: Option<String>,
) -> Result<LicenseStatus, String> {
    let _guard = LICENSE_LOCK.lock().await;
    let state_directory = directory.clone();
    let previous = tauri::async_runtime::spawn_blocking(move || saved_state(&state_directory))
        .await
        .map_err(|_| "无法检查本机授权")??;
    let key = license_key
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .unwrap_or(&previous.license_key);
    if key.is_empty() {
        return Err("请输入卡密".into());
    }
    if key.len() > 512 {
        return Err("卡密过长，请检查输入内容".into());
    }
    let nonce = uuid::Uuid::new_v4().to_string();
    let response = match request_verification(key, &previous.machine_id, &nonce).await {
        Ok(response) => response,
        Err(message) => {
            if previous.usable_at(now_secs()) {
                return Ok(LicenseStatus {
                    source: "offline",
                    message: format!("{message}。现有本机授权仍可离线使用"),
                    ..previous
                });
            }
            return Err(message);
        }
    };
    if !response.success {
        let message = response
            .msg
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| "卡密验证未通过".into());
        if previous.usable_at(now_secs()) && key != previous.license_key {
            return Ok(LicenseStatus {
                message: format!("{message}。原卡密继续有效"),
                ..previous
            });
        }
        clear_saved(&directory)?;
        return Ok(LicenseStatus::inactive(previous.machine_id, message));
    }
    let authorization = SignedAuthorization {
        payload: response.payload.ok_or("服务器缺少签名授权内容")?,
        signature: response.signature.ok_or("服务器缺少授权签名")?,
        last_verified_at: Some(now_secs()),
    };
    let payload = verified_payload(
        &authorization,
        &previous.machine_id,
        Some(key),
        Some(&nonce),
    )?;
    if !payload.valid_at(now_secs()) {
        return Err("服务器返回的卡密已到期".into());
    }
    let bytes = serde_json::to_vec(&authorization).map_err(|_| "无法保存授权内容")?;
    atomic_write(&directory.join(CACHE_FILE), &bytes)?;
    let mut status =
        LicenseStatus::from_payload(payload, authorization.last_verified_at, now_secs());
    status.source = "server";
    status.message = "轻页 PDF 激活成功，断网时也可在有效期内使用".into();
    Ok(status)
}

/// Removes only LightPage's authorization, retaining the stable installation identity.
#[tauri::command]
pub async fn card_license_clear(app: AppHandle) -> Result<(), String> {
    let _guard = LICENSE_LOCK.lock().await;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法获取授权存储目录")?;
    clear_saved(&directory)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_hardware_placeholders_do_not_share_one_machine_id() {
        for identity in [
            "",
            "00000000-0000-0000-0000-000000000000",
            "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
            "To be filled by O.E.M.",
        ] {
            assert!(usable_identity(identity).is_none());
        }
        assert_eq!(
            usable_identity("  valid-system-id  "),
            Some("valid-system-id".into())
        );
    }

    #[test]
    fn cache_replacement_is_complete_and_clear_is_idempotent() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(CACHE_FILE);
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        clear_saved(directory.path()).unwrap();
        clear_saved(directory.path()).unwrap();
    }

    #[test]
    fn machine_hash_matches_sha256_and_ignores_outer_whitespace() {
        assert_eq!(hash_identity("  abc  "), "BA7816BF8F01CFEA414140DE5DAE2223");
    }

    #[test]
    fn missing_hardware_fallback_is_stable_and_unique_per_installation() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let identity = installation_identity(first.path()).unwrap();
        assert_eq!(identity, installation_identity(first.path()).unwrap());
        assert_ne!(identity, installation_identity(second.path()).unwrap());
        clear_saved(first.path()).unwrap();
        assert_eq!(identity, installation_identity(first.path()).unwrap());
    }
}
