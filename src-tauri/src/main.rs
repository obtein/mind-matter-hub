// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // The secure update task runs the installed exe with this argument as SYSTEM. It never
  // starts the UI (and so never meets the single-instance plugin).
  if std::env::args().any(|a| a == app_lib::APPLY_ARG) {
    std::process::exit(app_lib::run_apply_update_cli());
  }
  app_lib::run();
}
