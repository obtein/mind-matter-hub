use tauri::Manager;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const TASK_NAME: &str = "PsiTrakUpdater";

/// Helper: create a Command that hides the console window on Windows
fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Check if the PsiTrakUpdater scheduled task already exists.
#[tauri::command]
fn check_update_task_exists() -> Result<bool, String> {
    let output = hidden_command("schtasks.exe")
        .args(["/Query", "/TN", TASK_NAME])
        .output()
        .map_err(|e| format!("Failed to run schtasks: {}", e))?;

    Ok(output.status.success())
}

/// Register a Windows Scheduled Task with elevated privileges.
/// This will trigger a one-time UAC prompt via PowerShell's Start-Process -Verb RunAs.
#[tauri::command]
fn register_update_task() -> Result<String, String> {
    if check_update_task_exists().unwrap_or(false) {
        return Ok("Task already exists".to_string());
    }

    let updater_script = std::env::temp_dir().join("psitrak_updater.cmd");
    let script_path = updater_script.to_string_lossy().to_string();

    let script_content = r#"@echo off
set /p MSI_PATH=<"%TEMP%\psitrak_update_msi_path.txt"
if "%MSI_PATH%"=="" exit /b 1
msiexec /i "%MSI_PATH%" /quiet /norestart
del "%TEMP%\psitrak_update_msi_path.txt"
"#;

    std::fs::write(&updater_script, script_content)
        .map_err(|e| format!("Failed to write updater script: {}", e))?;

    let schtasks_args = format!(
        "/Create /TN \"{}\" /TR \"cmd.exe /c \\\"{}\\\"\" /SC ONCE /ST 00:00 /RL HIGHEST /F",
        TASK_NAME,
        script_path.replace('\\', "\\\\")
    );

    let ps_command = format!(
        "Start-Process -FilePath 'schtasks.exe' -ArgumentList '{}' -Verb RunAs -Wait -WindowStyle Hidden",
        schtasks_args.replace('\'', "''")
    );

    // Note: register_update_task intentionally does NOT use CREATE_NO_WINDOW
    // because it needs to show the UAC elevation prompt via Start-Process -Verb RunAs.
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_command])
        .output()
        .map_err(|e| format!("Failed to launch elevated schtasks: {}", e))?;

    if check_update_task_exists().unwrap_or(false) {
        Ok("Task registered successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "Task registration failed (UAC denied or error). stderr: {}",
            stderr
        ))
    }
}

/// Trigger the PsiTrakUpdater scheduled task to install a given MSI silently.
#[tauri::command]
fn trigger_update_task(msi_path: String) -> Result<String, String> {
    if !std::path::Path::new(&msi_path).exists() {
        return Err(format!("MSI file not found: {}", msi_path));
    }

    let trigger_file = std::env::temp_dir().join("psitrak_update_msi_path.txt");
    std::fs::write(&trigger_file, &msi_path)
        .map_err(|e| format!("Failed to write trigger file: {}", e))?;

    let output = hidden_command("schtasks.exe")
        .args(["/Run", "/TN", TASK_NAME])
        .output()
        .map_err(|e| format!("Failed to trigger update task: {}", e))?;

    if output.status.success() {
        Ok("Update task triggered successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to trigger task: {}", stderr))
    }
}

/// Download the update MSI to a temp folder and return the path.
/// Uses PowerShell Invoke-WebRequest with hidden window.
#[tauri::command]
async fn download_update_msi(download_url: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let msi_path = temp_dir.join("PsiTrak_update.msi");
    let msi_path_str = msi_path.to_string_lossy().to_string();

    let ps_command = format!(
        "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        download_url.replace('\'', "''"),
        msi_path_str.replace('\'', "''")
    );

    let output = hidden_command("powershell.exe")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_command])
        .output()
        .map_err(|e| format!("Failed to download MSI: {}", e))?;

    if output.status.success() && msi_path.exists() {
        Ok(msi_path_str)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Download failed: {}", stderr))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
    .invoke_handler(tauri::generate_handler![
      check_update_task_exists,
      register_update_task,
      trigger_update_task,
      download_update_msi,
    ])
    .setup(|app| {
      use tauri_plugin_autostart::ManagerExt;
      let _ = app.autolaunch().enable();

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
