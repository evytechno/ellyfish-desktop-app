// Prevent console window in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;

use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem,
};

// ─────────────────────────────────────────────
// Session Storage
// ─────────────────────────────────────────────

fn session_path() -> std::path::PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_default();
    path.push("EllyFish/session.json");
    path
}

fn read_session() -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(session_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_session(map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let path = session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, serde_json::to_string(map).unwrap())
        .map_err(|e| e.to_string())
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
    Ok(map.get(&key).and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
fn secure_delete(key: String) -> Result<(), String> {
    let mut map = read_session();
    map.remove(&key);
    write_session(&map)
}

// ─────────────────────────────────────────────
// Window State (FIXED)
// ─────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self { width: 1280, height: 800, x: -1, y: -1 }
    }
}

fn state_path() -> std::path::PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_default();
    path.push("EllyFish/window-state.json");
    path
}

fn load_window_state() -> WindowState {
    fs::read_to_string(state_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

// 🔥 FIX: Ignore fullscreen/maximized states
fn save_window_state(window: &tauri::Window) {
    if window.is_fullscreen().unwrap_or(false)
        || window.is_maximized().unwrap_or(false)
    {
        return;
    }

    if let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) {
        let state = WindowState {
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
        };

        let _ = fs::create_dir_all(state_path().parent().unwrap());
        let _ = fs::write(state_path(), serde_json::to_string(&state).unwrap());
    }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

fn main() {
    // Single instance
    let (tx, rx) = mpsc::channel::<()>();

    let listener = match TcpListener::bind("127.0.0.1:17291") {
        Ok(l) => l,
        Err(_) => {
            if let Ok(mut s) = std::net::TcpStream::connect("127.0.0.1:17291") {
                let _ = s.write_all(b"show");
            }
            std::process::exit(0);
        }
    };

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut s) = stream {
                let mut buf = [0; 4];
                let _ = s.read(&mut buf);
                if &buf == b"show" {
                    let _ = tx.send(());
                }
            }
        }
    });

    // Tray
    let tray = SystemTray::new().with_menu(
        SystemTrayMenu::new()
            .add_item(CustomMenuItem::new("show", "Show"))
            .add_native_item(SystemTrayMenuItem::Separator)
            .add_item(CustomMenuItem::new("quit", "Quit"))
    );

    tauri::Builder::default()
        .system_tray(tray)
        .invoke_handler(tauri::generate_handler![
            secure_set,
            secure_get,
            secure_delete
        ])

        // ✅ FIXED WINDOW SETUP
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            let state = load_window_state();

            // Screen size
            let monitor = window.current_monitor()?.unwrap();
            let screen = monitor.size();

            // Clamp size (prevents fake fullscreen)
            let width = state.width.min(screen.width - 100);
            let height = state.height.min(screen.height - 100);

            window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize { width, height }
            ))?;

            // Position
            if state.x >= 0 && state.y >= 0 {
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition { x: state.x, y: state.y }
                ));
            } else {
                let _ = window.center();
            }

            // 🔥 HARD FIX
            let _ = window.set_fullscreen(false);
            let _ = window.unmaximize();
            let _ = window.set_decorations(true);

            // Focus fix — ensures the window comes to the front after
            // the WebView2 runtime finishes initialising on Windows.
            let w = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = w.show();
                let _ = w.set_focus();
            });

            // Restore on second instance
            let w2 = window.clone();
            std::thread::spawn(move || {
                while rx.recv().is_ok() {
                    let _ = w2.show();
                    let _ = w2.unminimize();
                    let _ = w2.set_focus();
                }
            });

            Ok(())
        })

        .on_window_event(|e| {
            match e.event() {
                tauri::WindowEvent::Moved(_) |
                tauri::WindowEvent::Resized(_) => {
                    save_window_state(e.window());
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Only intercept the main window — let splash (and any other window) close normally
                    if e.window().label() != "main" {
                        return;
                    }
                    save_window_state(e.window());
                    e.window().hide().unwrap();
                    api.prevent_close();
                }
                _ => {}
            }
        })

        .on_system_tray_event(|app, event| {
            if let Some(window) = app.get_window("main") {
                match event {
                    SystemTrayEvent::LeftClick { .. } => {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                        "show" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        "quit" => std::process::exit(0),
                        _ => {}
                    },
                    _ => {}
                }
            }
        })

        .run(tauri::generate_context!())
        .expect("error running app");
}