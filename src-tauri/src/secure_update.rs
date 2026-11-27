//! Silent updates for a standard Windows user (bug-hunt H6).
//!
//! Secure task: "PsiTrakUpdater" runs `<installed exe> --apply-update` as SYSTEM. It takes no
//! input from the user session: the elevated process itself downloads latest.json and the
//! installer from the fixed GitHub URLs, verifies the minisign signature and that the version is
//! newer, writes the verified bytes to a new file in the SYSTEM temp folder and runs msiexec.
//! Authenticated users may start the task, so anyone starting it can only cause a genuine update.
//!
//! Legacy task (created by app versions before 0.7.12): runs %TEMP%\psitrak_updater.cmd with the
//! MSI path from %TEMP%. It stays usable until an administrator registers the secure task,
//! because the doctor is a standard user and could not update otherwise; the app now verifies
//! the installer (signature, version, URL) before triggering it.

use crate::update_verify::{accept_installer, expected_msi_url, updater_pubkey, windows_entry, LATEST_JSON_URL};
use std::path::{Path, PathBuf};
use std::process::Command;

pub const TASK_NAME: &str = "PsiTrakUpdater";
pub const APPLY_ARG: &str = "--apply-update";
const LEGACY_SCRIPT: &str = "psitrak_updater.cmd";
const LEGACY_PATH_FILE: &str = "psitrak_update_msi_path.txt";
const LEGACY_MSI: &str = "PsiTrak_update.msi";

#[cfg(target_os = "windows")]
fn hidden(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new(program);
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd
}

#[cfg(not(target_os = "windows"))]
fn hidden(program: &str) -> Command {
    Command::new(program)
}

fn system32(exe: &str) -> PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    Path::new(&root).join("System32").join(exe)
}

fn current_version() -> semver::Version {
    semver::Version::parse(env!("CARGO_PKG_VERSION")).expect("package version is semver")
}

/// "missing", "legacy" or "secure".
pub fn task_status() -> &'static str {
    let out = match hidden(&system32("schtasks.exe").to_string_lossy())
        .args(["/Query", "/TN", TASK_NAME, "/XML"])
        .output()
    {
        Ok(o) if o.status.success() => o.stdout,
        _ => return "missing",
    };
    let ascii = APPLY_ARG.as_bytes();
    let utf16: Vec<u8> = APPLY_ARG.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let contains = |needle: &[u8]| out.windows(needle.len()).any(|w| w == needle);
    if contains(ascii) || contains(&utf16) {
        "secure"
    } else {
        "legacy"
    }
}

fn ps_single_quoted(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Registers (or replaces) the secure task. Needs one UAC prompt with administrator rights.
pub fn register_secure_task() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("exe path: {e}"))?;
    let exe_str = exe.to_string_lossy().to_string();
    let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    if !exe_str.to_lowercase().starts_with(&program_files.to_lowercase()) {
        // Only an exe in an admin-protected folder may be run as SYSTEM.
        return Err(format!("PsiTrak, Program Files dışında kurulu: {exe_str}"));
    }

    let script = format!(
        "$ErrorActionPreference='Stop'\n\
         $action = New-ScheduledTaskAction -Execute {exe} -Argument '{arg}'\n\
         $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest\n\
         $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)\n\
         Register-ScheduledTask -TaskName '{task}' -Action $action -Principal $principal -Settings $settings -Force | Out-Null\n\
         $svc = New-Object -ComObject 'Schedule.Service'; $svc.Connect()\n\
         $task = $svc.GetFolder('\\').GetTask('{task}')\n\
         $task.SetSecurityDescriptor('D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;AU)', 0)\n",
        exe = ps_single_quoted(&exe_str),
        arg = APPLY_ARG,
        task = TASK_NAME,
    );
    let encoded = {
        use base64::Engine;
        let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        base64::engine::general_purpose::STANDARD.encode(utf16)
    };
    // The encoded command contains only base64 characters; nothing user-controlled is quoted.
    let launcher = format!(
        "Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','{encoded}' -Verb RunAs -Wait -WindowStyle Hidden"
    );
    Command::new(system32(r"WindowsPowerShell\v1.0\powershell.exe"))
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &launcher])
        .output()
        .map_err(|e| format!("PowerShell başlatılamadı: {e}"))?;

    if task_status() != "secure" {
        return Err("Görev kaydedilemedi (yönetici onayı verilmedi veya hata).".to_string());
    }
    remove_legacy_files();
    Ok(())
}

pub fn remove_legacy_files() {
    let temp = std::env::temp_dir();
    for name in [LEGACY_SCRIPT, LEGACY_PATH_FILE, LEGACY_MSI] {
        let _ = std::fs::remove_file(temp.join(name));
    }
}

pub fn trigger_task() -> Result<(), String> {
    let out = hidden(&system32("schtasks.exe").to_string_lossy())
        .args(["/Run", "/TN", TASK_NAME])
        .output()
        .map_err(|e| format!("schtasks: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

fn curl_download(url: &str, to: &Path) -> Result<(), String> {
    let status = hidden(&system32("curl.exe").to_string_lossy())
        .args(["-fsSL", "--proto", "=https", "--max-filesize", "314572800", "--retry", "2", "-o"])
        .arg(to)
        .arg(url)
        .status()
        .map_err(|e| format!("curl: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("download failed ({status}): {url}"))
    }
}

fn unique_path(dir: &Path, stem: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.join(format!("{stem}-{}-{nanos}.msi", std::process::id()))
}

/// Writes bytes to a file that must not exist yet (no pre-created or linked file is reused).
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

/// Legacy path, run in the user session: download, verify, keep the file for the legacy task.
pub fn legacy_download(download_url: &str, signature: &str) -> Result<PathBuf, String> {
    let temp = std::env::temp_dir();
    let tmp = unique_path(&temp, "psitrak-download");
    curl_download(download_url, &tmp)?;
    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&tmp);
    let bytes = bytes?;
    accept_installer(&bytes, download_url, signature, &updater_pubkey()?, &current_version())?;
    let msi = temp.join(LEGACY_MSI);
    let _ = std::fs::remove_file(&msi);
    write_new(&msi, &bytes)?;
    Ok(msi)
}

/// Legacy path: hand the verified file to the legacy task and start it.
pub fn legacy_trigger() -> Result<(), String> {
    let msi = std::env::temp_dir().join(LEGACY_MSI);
    if !msi.exists() {
        return Err("doğrulanmış kurulum dosyası yok".to_string());
    }
    std::fs::write(std::env::temp_dir().join(LEGACY_PATH_FILE), msi.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;
    trigger_task()
}

fn log(line: &str) {
    use std::io::Write;
    let path = std::env::temp_dir().join("psitrak-update.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{:?} {line}", std::time::SystemTime::now());
    }
}

/// Number of other running processes with this exe's image name.
fn other_app_instances() -> usize {
    let exe = std::env::current_exe().ok();
    let name = exe
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if name.is_empty() {
        return 0;
    }
    let filter = format!("IMAGENAME eq {name}");
    let out = match hidden(&system32("tasklist.exe").to_string_lossy())
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return 0,
    };
    let me = std::process::id().to_string();
    out.lines()
        .filter(|l| l.to_lowercase().contains(&name.to_lowercase()))
        .filter(|l| l.split(',').nth(1).map(|p| p.trim_matches('"') != me).unwrap_or(true))
        .count()
}

/// Entry point of `--apply-update` (the elevated task). Returns a short result for the log.
pub fn apply_update() -> Result<String, String> {
    let current = current_version();
    let temp = std::env::temp_dir();

    let json_path = unique_path(&temp, "psitrak-latest");
    curl_download(LATEST_JSON_URL, &json_path)?;
    let json = std::fs::read_to_string(&json_path).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&json_path);
    let latest: serde_json::Value = serde_json::from_str(&json?).map_err(|e| format!("latest.json: {e}"))?;
    let (url, signature, version) = windows_entry(&latest).ok_or("latest.json has no Windows entry")?;
    if version <= current {
        return Ok(format!("up to date ({current})"));
    }
    if url != expected_msi_url(&version) {
        return Err(format!("unexpected URL in latest.json: {url}"));
    }

    let download = unique_path(&temp, "psitrak-download");
    curl_download(&url, &download)?;
    let bytes = std::fs::read(&download).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&download);
    let bytes = bytes?;
    accept_installer(&bytes, &url, &signature, &updater_pubkey()?, &current)?;

    // Install from a fresh file holding exactly the verified bytes.
    let msi = unique_path(&temp, "psitrak-install");
    write_new(&msi, &bytes)?;

    // Give the app up to 60 s to exit so its files can be replaced.
    for _ in 0..60 {
        if other_app_instances() == 0 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    let status = hidden(&system32("msiexec.exe").to_string_lossy())
        .args(["/i"])
        .arg(&msi)
        .args(["/quiet", "/norestart"])
        .status()
        .map_err(|e| format!("msiexec: {e}"));
    let _ = std::fs::remove_file(&msi);
    let status = status?;
    if status.success() {
        Ok(format!("installed {version}"))
    } else {
        Err(format!("msiexec exit {status}"))
    }
}

/// Runs `--apply-update` and records the outcome. Called from main() before Tauri starts.
pub fn run_apply_update_cli() -> i32 {
    match apply_update() {
        Ok(msg) => {
            log(&format!("ok: {msg}"));
            0
        }
        Err(err) => {
            log(&format!("error: {err}"));
            1
        }
    }
}
