use base64::{engine::general_purpose::STANDARD, Engine as _};
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use p256::pkcs8::DecodePublicKey;
use serde::{Deserialize, Serialize};

pub const SOFTWARE_ID: &str = "pdf_book";
const PUBLIC_KEY: &str = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5uPPH27PMJisMmu0BeqGeON2EqqWppenVbxn8JqFKcbqc/k8cIolW5zzbHf+9dRaLPUMCrIHD+uQhD/Za1F48A==";
const PERMANENT_TIMESTAMP: u64 = 9_999_999_999;

#[derive(Clone, Deserialize, Serialize)]
pub struct SignedAuthorization {
    pub payload: String,
    pub signature: String,
    pub last_verified_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct LicensePayload {
    pub software_id: String,
    pub license_key: String,
    pub machine_id: String,
    pub nonce: Option<String>,
    #[serde(default, deserialize_with = "timestamp")]
    pub expires_at: Option<u64>,
    #[serde(default)]
    pub permanent: bool,
}

fn timestamp<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<u64>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    value
        .map(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str()?.parse().ok())
                .ok_or_else(|| serde::de::Error::custom("授权到期时间无效"))
        })
        .transpose()
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub activated: bool,
    pub license_key: String,
    pub machine_id: String,
    pub expires_at: Option<u64>,
    pub permanent: bool,
    pub last_verified_at: Option<u64>,
    pub message: String,
    pub source: &'static str,
}

impl LicensePayload {
    pub fn permanent(&self) -> bool {
        self.permanent
            || self
                .expires_at
                .is_some_and(|value| value >= PERMANENT_TIMESTAMP)
    }

    pub fn valid_at(&self, now: u64) -> bool {
        self.permanent() || self.expires_at.is_some_and(|value| value > now)
    }
}

impl LicenseStatus {
    pub fn usable_at(&self, now: u64) -> bool {
        self.activated && (self.permanent || self.expires_at.is_some_and(|expiry| expiry > now))
    }

    pub fn inactive(machine_id: String, message: impl Into<String>) -> Self {
        Self {
            activated: false,
            license_key: String::new(),
            machine_id,
            expires_at: None,
            permanent: false,
            last_verified_at: None,
            message: message.into(),
            source: "none",
        }
    }

    pub fn from_payload(payload: LicensePayload, last_verified_at: Option<u64>, now: u64) -> Self {
        let permanent = payload.permanent();
        let activated = payload.valid_at(now);
        Self {
            activated,
            license_key: payload.license_key,
            machine_id: payload.machine_id,
            expires_at: payload.expires_at,
            permanent,
            last_verified_at,
            message: if activated {
                "本机授权有效"
            } else {
                "卡密已到期，请联网激活新卡密"
            }
            .into(),
            source: "cache",
        }
    }
}

fn decode_signed(
    authorization: &SignedAuthorization,
    public_key: &[u8],
) -> Result<LicensePayload, String> {
    let key = VerifyingKey::from_public_key_der(public_key).map_err(|_| "授权公钥无效")?;
    let signature = STANDARD
        .decode(authorization.signature.trim())
        .map_err(|_| "授权签名格式无效")?;
    let signature = Signature::from_der(&signature)
        .or_else(|_| Signature::from_slice(&signature))
        .map_err(|_| "授权签名格式无效")?;
    key.verify(authorization.payload.as_bytes(), &signature)
        .map_err(|_| "授权验签失败，请重新联网激活")?;
    serde_json::from_str(&authorization.payload)
        .map_err(|_| "授权内容缺少软件标识或字段无效，请重新联网激活".into())
}

fn validate_binding(
    payload: &LicensePayload,
    machine_id: &str,
    key: Option<&str>,
    nonce: Option<&str>,
) -> Result<(), String> {
    if payload.software_id != SOFTWARE_ID {
        return Err("该卡密不属于轻页 PDF".into());
    }
    if payload.machine_id != machine_id {
        return Err("该授权不属于当前设备，请使用本机卡密".into());
    }
    if payload.license_key.trim().is_empty() || key.is_some_and(|key| key != payload.license_key) {
        return Err("服务器返回的卡密与本次请求不一致".into());
    }
    if nonce.is_some_and(|nonce| payload.nonce.as_deref() != Some(nonce)) {
        return Err("授权请求校验失败，请重试激活".into());
    }
    if !payload.permanent() && payload.expires_at.is_none() {
        return Err("授权缺少到期时间".into());
    }
    Ok(())
}

/// Validates the exact signed bytes and product/device/key binding. Online calls must supply the request nonce.
pub fn verified_payload(
    authorization: &SignedAuthorization,
    machine_id: &str,
    key: Option<&str>,
    nonce: Option<&str>,
) -> Result<LicensePayload, String> {
    let public_key = STANDARD.decode(PUBLIC_KEY).map_err(|_| "授权公钥无效")?;
    let payload = decode_signed(authorization, &public_key)?;
    validate_binding(&payload, machine_id, key, nonce)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{signature::Signer, SigningKey};
    use p256::pkcs8::EncodePublicKey;

    fn payload() -> LicensePayload {
        serde_json::from_str(r#"{"software_id":"pdf_book","license_key":"TEST-CARD","machine_id":"DEVICE","nonce":"REQUEST","expires_at":"2000"}"#).unwrap()
    }

    #[test]
    fn product_device_key_and_nonce_are_required_exactly() {
        let mut data = payload();
        assert!(validate_binding(&data, "DEVICE", Some("TEST-CARD"), Some("REQUEST")).is_ok());
        assert!(validate_binding(&data, "OTHER", None, None).is_err());
        assert!(validate_binding(&data, "DEVICE", Some("OTHER"), None).is_err());
        assert!(validate_binding(&data, "DEVICE", None, Some("REPLAY")).is_err());
        data.nonce = None;
        assert!(validate_binding(&data, "DEVICE", None, Some("REQUEST")).is_err());
        assert!(validate_binding(&data, "DEVICE", None, None).is_ok());
        data.software_id = "novel".into();
        assert!(validate_binding(&data, "DEVICE", None, None).is_err());
    }

    #[test]
    fn missing_product_or_expiry_cannot_unlock() {
        assert!(serde_json::from_str::<LicensePayload>(
            r#"{"license_key":"TEST-CARD","machine_id":"DEVICE"}"#
        )
        .is_err());
        let mut data = payload();
        data.expires_at = None;
        assert!(validate_binding(&data, "DEVICE", None, None).is_err());
        data.permanent = true;
        assert!(validate_binding(&data, "DEVICE", None, None).is_ok());
    }

    #[test]
    fn expiry_is_enforced_at_the_exact_second() {
        let data = payload();
        assert!(data.valid_at(1999));
        assert!(!data.valid_at(2000));
        let current = LicenseStatus::from_payload(payload(), Some(1000), 1999);
        assert!(current.usable_at(1999));
        assert!(!current.usable_at(2000));
        let status = LicenseStatus::from_payload(data, Some(1000), 2000);
        assert!(!status.activated);
        assert_eq!(status.expires_at, Some(2000));
    }

    #[test]
    fn permanent_authorization_does_not_need_expiry() {
        let mut data = payload();
        data.expires_at = None;
        data.permanent = true;
        assert!(data.valid_at(u64::MAX));
    }

    #[test]
    fn signatures_accept_der_and_p1363_but_reject_changed_bytes() {
        let key = SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
        let public_key = p256::PublicKey::from_sec1_bytes(
            key.verifying_key().to_encoded_point(false).as_bytes(),
        )
        .unwrap()
        .to_public_key_der()
        .unwrap();
        let json = r#"{"software_id":"pdf_book","license_key":"TEST-CARD","machine_id":"DEVICE","nonce":"REQUEST","expires_at":2000}"#;
        let signature: Signature = key.sign(json.as_bytes());
        for bytes in [
            signature.to_der().as_bytes().to_vec(),
            signature.to_bytes().to_vec(),
        ] {
            let mut authorization = SignedAuthorization {
                payload: json.into(),
                signature: STANDARD.encode(bytes),
                last_verified_at: Some(1000),
            };
            assert!(decode_signed(&authorization, public_key.as_bytes()).is_ok());
            assert!(verified_payload(&authorization, "DEVICE", None, None).is_err());
            authorization.payload.push(' ');
            assert!(decode_signed(&authorization, public_key.as_bytes()).is_err());
        }
    }

    #[test]
    fn invalid_base64_and_invalid_timestamps_fail_closed() {
        let authorization = SignedAuthorization {
            payload: "{}".into(),
            signature: "invalid".into(),
            last_verified_at: None,
        };
        assert!(verified_payload(&authorization, "DEVICE", None, None).is_err());
        assert!(serde_json::from_str::<LicensePayload>(r#"{"software_id":"pdf_book","license_key":"TEST-CARD","machine_id":"DEVICE","expires_at":-1}"#).is_err());
    }
}
