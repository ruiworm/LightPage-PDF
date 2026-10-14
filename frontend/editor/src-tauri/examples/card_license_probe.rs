#[allow(dead_code)]
#[path = "../src/commands/card_license.rs"]
mod card_commands;
#[path = "../src/card_license.rs"]
mod card_license;

fn main() {
    let directory = std::env::var_os("APPDATA")
        .map(std::path::PathBuf::from)
        .expect("Windows APPDATA is required")
        .join("stirling.pdf.dev");
    if std::env::args().any(|argument| argument == "--offline") {
        let started = std::time::Instant::now();
        let summary = match card_commands::saved_state(&directory) {
            Ok(status) => {
                serde_json::json!({"activated": status.activated, "source": status.source, "expiresAt": status.expires_at, "permanent": status.permanent, "networkRequested": false, "elapsedMs": started.elapsed().as_millis()})
            }
            Err(_) => {
                serde_json::json!({"activated": false, "networkRequested": false, "error": "Local authorization could not be verified"})
            }
        };
        println!("{summary}");
        return;
    }
    let mut key = String::new();
    std::io::stdin()
        .read_line(&mut key)
        .expect("Card must be provided on stdin");
    let key = key.trim().to_string();
    if key.is_empty() {
        eprintln!("请输入卡密");
        std::process::exit(2);
    }
    let started = std::time::Instant::now();
    let result = tauri::async_runtime::block_on(card_commands::verify_in(
        directory.clone(),
        Some(key.clone()),
    ));
    let summary = match result {
        Ok(status) => {
            let offline = card_commands::saved_state(&directory);
            serde_json::json!({
                "activated": status.activated,
                "requestedCardAccepted": status.source == "server" && status.license_key == key,
                "source": status.source,
                "expiresAt": status.expires_at,
                "permanent": status.permanent,
                "message": status.message.replace(&key, "[CARD]"),
                "offlineCacheValid": offline.as_ref().is_ok_and(|saved| saved.activated),
                "softwareId": card_license::SOFTWARE_ID,
                "elapsedMs": started.elapsed().as_millis(),
            })
        }
        Err(error) => {
            serde_json::json!({ "activated": false, "error": error.replace(&key, "[CARD]"), "elapsedMs": started.elapsed().as_millis() })
        }
    };
    println!("{}", summary);
}
