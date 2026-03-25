use tauri::Manager;
use std::process::Command;

const TASK_NAME: &str = "PsiTrakUpdater";

/// Check if the PsiTrakUpdater scheduled task already exists.
#[tauri::command]
fn check_update_task_exists() -> Result<bool, String> {
    let output = Command::new("schtasks.exe")
        .args(["/Query", "/TN", TASK_NAME])
        .output()
        .map_err(|e| format!("Failed to run schtasks: {}", e))?;

    // Exit code 0 means the task exists
    Ok(output.status.success())
}

/// Register a Windows Scheduled Task with elevated privileges.
/// This will trigger a one-time UAC prompt via PowerShell's Start-Process -Verb RunAs.
/// The task is created as an on-demand task (no recurring schedule) that runs
/// msiexec silently when triggered with the MSI path passed as an argument.
#[tauri::command]
fn register_update_task() -> Result<String, String> {
    // First check if task already exists
    if check_update_task_exists().unwrap_or(false) {
        return Ok("Task already exists".to_string());
    }

    // Build the schtasks /Create command.
    // The task action: msiexec /i <MSI_PATH> /quiet /norestart
    // We use $(Arg0) placeholder — when triggering, we pass the MSI path.
    // Since schtasks doesn't support argument placeholders natively,
    // we create the task to run a cmd wrapper that reads the MSI path from a known temp file.
    let updater_script = std::env::temp_dir().join("psitrak_updater.cmd");
    let script_path = updater_script.to_string_lossy().to_string();

    // Write the updater batch script that reads the MSI path from a trigger file
    let script_content = r#"@echo off
set /p MSI_PATH=<"%TEMP%\psitrak_update_msi_path.txt"
if "%MSI_PATH%"=="" exit /b 1
msiexec /i "%MSI_PATH%" /quiet /norestart
del "%TEMP%\psitrak_update_msi_path.txt"
"#;

    std::fs::write(&updater_script, script_content)
        .map_err(|e| format!("Failed to write updater script: {}", e))?;

    // Use PowerShell Start-Process -Verb RunAs to get a UAC elevation prompt,
    // which then runs schtasks /Create with elevated privileges.
    let schtasks_args = format!(
        "/Create /TN \"{}\" /TR \"cmd.exe /c \\\"{}\\\"\" /SC ONCE /ST 00:00 /RL HIGHEST /F",
        TASK_NAME,
        script_path.replace('\\', "\\\\")
    );

    let ps_command = format!(
        "Start-Process -FilePath 'schtasks.exe' -ArgumentList '{}' -Verb RunAs -Wait -WindowStyle Hidden",
        schtasks_args.replace('\'', "''")
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &ps_command])
        .output()
        .map_err(|e| format!("Failed to launch elevated schtasks: {}", e))?;

    // Verify the task was actually created (user might have denied UAC)
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
/// Writes the MSI path to a temp file, then runs the task via schtasks /Run.
#[tauri::command]
fn trigger_update_task(msi_path: String) -> Result<String, String> {
    // Validate that the MSI file exists
    if !std::path::Path::new(&msi_path).exists() {
        return Err(format!("MSI file not found: {}", msi_path));
    }

    // Write the MSI path to the temp trigger file
    let trigger_file = std::env::temp_dir().join("psitrak_update_msi_path.txt");
    std::fs::write(&trigger_file, &msi_path)
        .map_err(|e| format!("Failed to write trigger file: {}", e))?;

    // Run the scheduled task
    let output = Command::new("schtasks.exe")
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
/// Uses the updater endpoint from tauri.conf.json to get the download URL,
/// then downloads the MSI using PowerShell.
#[tauri::command]
async fn download_update_msi(download_url: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let msi_path = temp_dir.join("PsiTrak_update.msi");
    let msi_path_str = msi_path.to_string_lossy().to_string();

    // Use PowerShell to download the file
    let ps_command = format!(
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        download_url.replace('\'', "''"),
        msi_path_str.replace('\'', "''")
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &ps_command])
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
      // İkinci instance açılırsa mevcut pencereyi öne getir
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
      // Enable autostart on first run
      use tauri_plugin_autostart::ManagerExt;
      let _ = app.autolaunch().enable();

      // DevTools available via right-click → Inspect in release builds
      // (enabled by "devtools" feature in Cargo.toml)

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
