use tauri::Manager;

mod secure_update;
mod update_verify;

pub use secure_update::{run_apply_update_cli, APPLY_ARG};

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("task failed: {e}"))
}

/// "missing", "legacy" (pre-0.7.12 task running a %TEMP% script) or "secure".
#[tauri::command]
async fn update_task_status() -> Result<String, String> {
    blocking(|| secure_update::task_status().to_string()).await
}

/// One UAC prompt (administrator): registers the secure SYSTEM task that verifies updates itself.
#[tauri::command]
async fn register_secure_update_task() -> Result<(), String> {
    blocking(secure_update::register_secure_task).await?
}

#[tauri::command]
async fn trigger_secure_update() -> Result<(), String> {
    blocking(|| {
        if secure_update::task_status() != "secure" {
            return Err("secure update task is not registered".to_string());
        }
        secure_update::trigger_task()
    })
    .await?
}

/// Legacy path: download and VERIFY the installer (fixed URL, signature, newer version).
#[tauri::command]
async fn download_update_msi(download_url: String, signature: String) -> Result<String, String> {
    blocking(move || {
        secure_update::legacy_download(&download_url, &signature).map(|p| p.to_string_lossy().to_string())
    })
    .await?
}

/// Legacy path: start the legacy task on the verified file. Takes no path from the webview.
#[tauri::command]
async fn trigger_update_task() -> Result<(), String> {
    blocking(secure_update::legacy_trigger).await?
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
      update_task_status,
      register_secure_update_task,
      trigger_secure_update,
      download_update_msi,
      trigger_update_task,
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
