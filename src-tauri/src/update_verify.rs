//! Verification of update installers (bug-hunt H6).
//!
//! An installer is only accepted when:
//! - its URL is the fixed GitHub release URL for its version,
//! - its minisign signature verifies against the updater public key in tauri.conf.json
//!   (the same key and check that tauri-plugin-updater uses), and
//! - the version named in the signed trusted comment is newer than the running app.

use base64::Engine;
use minisign_verify::{PublicKey, Signature};

pub const LATEST_JSON_URL: &str =
    "https://github.com/obtein/mind-matter-hub/releases/latest/download/latest.json";
const RELEASE_PREFIX: &str = "https://github.com/obtein/mind-matter-hub/releases/download/v";
const TAURI_CONF: &str = include_str!("../tauri.conf.json");

fn b64_to_string(s: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(s.trim())
        .map_err(|e| format!("invalid base64: {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("invalid utf-8: {e}"))
}

/// The updater public key compiled into this binary (plugins.updater.pubkey).
pub fn updater_pubkey() -> Result<String, String> {
    let conf: serde_json::Value =
        serde_json::from_str(TAURI_CONF).map_err(|e| format!("tauri.conf.json: {e}"))?;
    conf["plugins"]["updater"]["pubkey"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "updater pubkey missing".to_string())
}

/// Verifies `data` against a Tauri-style signature (base64 of the minisign .sig file) and
/// returns the signed trusted comment.
pub fn verify_minisign(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<String, String> {
    let public_key =
        PublicKey::decode(&b64_to_string(pubkey_b64)?).map_err(|e| format!("public key: {e}"))?;
    let signature =
        Signature::decode(&b64_to_string(signature_b64)?).map_err(|e| format!("signature: {e}"))?;
    public_key
        .verify(data, &signature, true)
        .map_err(|e| format!("signature does not match: {e}"))?;
    Ok(signature.trusted_comment().to_string())
}

/// "timestamp:1791831514\tfile:PsiTrak_0.7.8_x64_en-US.msi" -> 0.7.8
pub fn version_in_trusted_comment(comment: &str) -> Option<semver::Version> {
    let file = comment
        .split(|c: char| c == '\t' || c == ' ')
        .find_map(|part| part.strip_prefix("file:"))?;
    let rest = file.strip_prefix("PsiTrak_")?;
    let version = rest.split('_').next()?;
    semver::Version::parse(version).ok()
}

pub fn expected_msi_url(version: &semver::Version) -> String {
    format!("{RELEASE_PREFIX}{version}/PsiTrak_{version}_x64_en-US.msi")
}

/// The Windows entry of latest.json: (url, signature, version).
pub fn windows_entry(latest: &serde_json::Value) -> Option<(String, String, semver::Version)> {
    let version = semver::Version::parse(latest["version"].as_str()?.trim_start_matches('v')).ok()?;
    let platforms = latest["platforms"].as_object()?;
    let entry = platforms
        .get("windows-x86_64-msi")
        .or_else(|| platforms.get("windows-x86_64"))?;
    Some((
        entry["url"].as_str()?.to_string(),
        entry["signature"].as_str()?.to_string(),
        version,
    ))
}

/// Full acceptance check for downloaded installer bytes. Returns the verified version.
pub fn accept_installer(
    data: &[u8],
    url: &str,
    signature_b64: &str,
    pubkey_b64: &str,
    current: &semver::Version,
) -> Result<semver::Version, String> {
    let comment = verify_minisign(data, signature_b64, pubkey_b64)?;
    let version = version_in_trusted_comment(&comment)
        .ok_or_else(|| format!("no version in signed comment: {comment}"))?;
    if url != expected_msi_url(&version) {
        return Err(format!("unexpected download URL for {version}: {url}"));
    }
    if &version <= current {
        return Err(format!("{version} is not newer than {current}"));
    }
    Ok(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real signature of PsiTrak_0.7.8_x64_en-US.msi from the published latest.json.
    const SIG_078: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUTGpGbVlqb0paYXlwNHJBRUYyK1BkVHc3TmpiQ2huUlZOaXBIcUEyMTB6YWVreEtzTTVMUlh6MGhVcGpHL0R0Z1BRdFFsUWdQSmswdGpGZldnU2I5akFOWlM3a3FjaHdzPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxODMxNTE0CWZpbGU6UHNpVHJha18wLjcuOF94NjRfZW4tVVMubXNpClRZaW9ubzJubjUxSVpSaU5mYjV1OVJzNHNCQmFFLzBkKzlqcGdWY2NaZlRkWW5SN0IzNE1WYllEMk9LQ3l0S0NqZW9YaEhmdTIwYnlid0RwYlRvVURRPT0K";

    #[test]
    fn reads_the_pubkey_from_tauri_conf() {
        assert!(updater_pubkey().unwrap().len() > 40);
    }

    #[test]
    fn rejects_bytes_that_do_not_match_the_signature() {
        let err = verify_minisign(b"not the installer", SIG_078, &updater_pubkey().unwrap()).unwrap_err();
        assert!(err.contains("does not match"), "{err}");
    }

    #[test]
    fn parses_the_version_from_the_trusted_comment() {
        let v = version_in_trusted_comment("timestamp:1791831514\tfile:PsiTrak_0.7.8_x64_en-US.msi").unwrap();
        assert_eq!(v, semver::Version::new(0, 7, 8));
        assert!(version_in_trusted_comment("timestamp:1\tfile:Other_1.0.0.msi").is_none());
    }

    #[test]
    fn builds_the_only_accepted_url() {
        assert_eq!(
            expected_msi_url(&semver::Version::new(0, 7, 12)),
            "https://github.com/obtein/mind-matter-hub/releases/download/v0.7.12/PsiTrak_0.7.12_x64_en-US.msi"
        );
    }

    #[test]
    fn picks_the_windows_entry_of_latest_json() {
        let json: serde_json::Value = serde_json::json!({
            "version": "0.7.11",
            "platforms": { "windows-x86_64": { "url": "u", "signature": "s" } }
        });
        let (url, sig, v) = windows_entry(&json).unwrap();
        assert_eq!((url.as_str(), sig.as_str(), v), ("u", "s", semver::Version::new(0, 7, 11)));
    }

    /// Downloads the real 0.7.8 installer (network). Run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn accepts_the_real_078_installer_only_when_newer() {
        let path = std::env::temp_dir().join("psitrak-verify-test-078.msi");
        let status = std::process::Command::new("curl")
            .args(["-fsSL", "-o"])
            .arg(&path)
            .arg(expected_msi_url(&semver::Version::new(0, 7, 8)))
            .status()
            .unwrap();
        assert!(status.success());
        let data = std::fs::read(&path).unwrap();
        let key = updater_pubkey().unwrap();
        let url = expected_msi_url(&semver::Version::new(0, 7, 8));
        let v = accept_installer(&data, &url, SIG_078, &key, &semver::Version::new(0, 7, 7)).unwrap();
        assert_eq!(v, semver::Version::new(0, 7, 8));
        // Same bytes, but the app is already 0.7.8: a downgrade/replay is refused.
        assert!(accept_installer(&data, &url, SIG_078, &key, &semver::Version::new(0, 7, 8)).is_err());
        // Same bytes, wrong URL: refused.
        assert!(accept_installer(&data, "https://evil.example/x.msi", SIG_078, &key, &semver::Version::new(0, 7, 7)).is_err());
        let mut tampered = data.clone();
        tampered[1000] ^= 0xff;
        assert!(accept_installer(&tampered, &url, SIG_078, &key, &semver::Version::new(0, 7, 7)).is_err());
    }
}
