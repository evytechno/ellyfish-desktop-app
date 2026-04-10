// Prevents a console window from appearing on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem,
};

// ── Secure Token Commands ──────────────────────────────────────────
// Tokens stored in AppData/Local/EllyFish/session.json
// (Windows Credential Manager has a 2560-char limit — JWT tokens exceed it)

fn session_path() -> std::path::PathBuf {
    let mut path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("EllyFish");
    path.push("session.json");
    path
}

fn read_session() -> serde_json::Map<String, serde_json::Value> {
    let path = session_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_session(map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let path = session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_set(key: String, value: String) -> Result<(), String> {
    let mut map = read_session();
    map.insert(key, serde_json::Value::String(value));
    write_session(&map)
}

#[tauri::command]
fn secure_get(key: String) -> Result<Option<String>, String> {
    let map = read_session();
    Ok(map.get(&key).and_then(|v| v.as_str()).map(|s| s.to_string()))
}

#[tauri::command]
fn secure_delete(key: String) -> Result<(), String> {
    let mut map = read_session();
    map.remove(&key);
    write_session(&map)
}

// ── Device Name Command ────────────────────────────────────────────

#[tauri::command]
fn set_tray_tooltip(app_handle: tauri::AppHandle, count: u32) -> Result<(), String> {
    let tooltip = if count > 0 {
        format!("Elly Fish ({} new)", count)
    } else {
        "Elly Fish".to_string()
    };
    app_handle
        .tray_handle()
        .set_tooltip(&tooltip)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_device_name() -> String {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "User".to_string());
    format!("{} PC", username)
}

// ── Window State ───────────────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize)]
struct WindowState {
    width:  u32,
    height: u32,
    x:      i32,
    y:      i32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self { width: 1280, height: 800, x: -1, y: -1 }
    }
}

fn state_path() -> std::path::PathBuf {
    let mut path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("EllyFish");
    path.push("window-state.json");
    path
}

fn load_window_state() -> WindowState {
    let path = state_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_window_state(window: &tauri::Window) {
    if let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) {
        let state = WindowState {
            width:  size.width,
            height: size.height,
            x:      pos.x,
            y:      pos.y,
        };
        if let Ok(json) = serde_json::to_string(&state) {
            let path = state_path();
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, json);
        }
    }
}

fn main() {
    // ── Single Instance Lock ───────────────────────────────────────
    // Channel to signal the running instance to show its window
    let (show_tx, show_rx) = mpsc::channel::<()>();

    let lock = match TcpListener::bind("127.0.0.1:17291") {
        Ok(listener) => listener,
        Err(_) => {
            // App already running — send "show" signal to it, then exit
            if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:17291") {
                let _ = stream.write_all(b"show");
            }
            std::process::exit(0);
        }
    };

    // Spawn a thread that listens for "show" signals from new instances
    std::thread::spawn(move || {
        for stream in lock.incoming() {
            if let Ok(mut s) = stream {
                let mut buf = [0u8; 4];
                let _ = s.read(&mut buf);
                if &buf == b"show" {
                    let _ = show_tx.send(());
                }
            }
        }
    });

    // ── System Tray Menu ───────────────────────────────────────────
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    // ── Tauri App ──────────────────────────────────────────────────
    tauri::Builder::default()
        .system_tray(system_tray)
        .invoke_handler(tauri::generate_handler![
            secure_set,
            secure_get,
            secure_delete,
            get_device_name,
            set_tray_tooltip,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();

            // Restore window state
            let state = load_window_state();
            let _ = window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize { width: state.width, height: state.height }
            ));
            if state.x >= 0 && state.y >= 0 {
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition { x: state.x, y: state.y }
                ));
            } else {
                let _ = window.center();
            }

            // Delayed focus — WebView2 keyboard fix
            let w = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(600));
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.eval("window.focus(); document.body && document.body.focus();");
            });

            // Listen for "show" signals — bring window to front when shortcut clicked
            let w2 = window.clone();
            std::thread::spawn(move || {
                while show_rx.recv().is_ok() {
                    let _ = w2.show();
                    let _ = w2.unminimize();
                    let _ = w2.set_focus();
                }
            });

            Ok(())
        })
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "quit" => std::process::exit(0),
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            match event.event() {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    save_window_state(event.window());
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    save_window_state(event.window());
                    event.window().hide().unwrap();
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Elly Fish");
}
