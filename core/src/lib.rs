mod assembler;
mod embedded_extension;
mod engine;
mod limiter;
mod manager;
mod models;
pub mod server;
mod storage;
mod tray;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::manager::DownloadManager;
use crate::models::{DownloadTask, UrlMetadata};
use crate::server::{BrowserBridgeConfig, BrowserServerState, DEFAULT_SERVER_PORT};
use crate::storage::StateStorage;

pub fn force_square_corners<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    {
        if let Ok(hwnd) = _window.hwnd() {
            unsafe {
                use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND};
                let corner_pref = DWMWCP_DONOTROUND;
                let _ = DwmSetWindowAttribute(
                    hwnd.0 as _,
                    DWMWA_WINDOW_CORNER_PREFERENCE as _,
                    &corner_pref as *const _ as _,
                    std::mem::size_of::<u32>() as u32,
                );
            }
        }
    }
}

pub struct AppState {
    pub manager: Arc<DownloadManager>,
    pub server_state: Arc<BrowserServerState>,
}

#[tauri::command]
async fn set_ffmpeg_path(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.manager.set_ffmpeg_path(path).await;
    Ok(())
}

#[tauri::command]
async fn set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())
    } else {
        autolaunch.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn is_autostart(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_browser_config(
    config: BrowserBridgeConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.server_state.config.write().await;
    *lock = config;
    Ok(())
}

#[tauri::command]
async fn probe_url(url: String, state: State<'_, AppState>) -> Result<UrlMetadata, String> {
    state.manager.engine().probe_url(&url).await
}

#[tauri::command]
async fn get_tasks(state: State<'_, AppState>) -> Result<Vec<DownloadTask>, String> {
    Ok(state.manager.get_tasks().await)
}

#[tauri::command]
async fn get_task(task_id: String, state: State<'_, AppState>) -> Result<Option<DownloadTask>, String> {
    Ok(state.manager.get_task(&task_id).await)
}

#[tauri::command]
async fn add_task(
    url: String,
    audio_url: Option<String>,
    filename: String,
    destination_path: String,
    connections: usize,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DownloadTask, String> {
    let task = state.manager.add_task(url, audio_url, filename, destination_path, connections).await?;
    let _ = app.emit("task-created", &task);
    Ok(task)
}

#[tauri::command]
async fn start_download(
    task_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.manager.start_download(&task_id, app).await
}

#[tauri::command]
async fn pause_download(
    task_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.manager.pause_download(&task_id, Some(&app)).await
}

#[tauri::command]
async fn set_speed_limiter(
    enabled: bool,
    speed_kb_sec: Option<u64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let bytes_sec = speed_kb_sec.map(|kb| kb * 1024);
    state.manager.set_speed_limiter(enabled, bytes_sec);
    Ok(())
}

#[tauri::command]
async fn delete_task(
    task_id: String,
    delete_file: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.manager.delete_task(&task_id, delete_file).await
}

#[tauri::command]
async fn pick_folder(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_title("Select Download Folder");
    if let Some(ref p) = default_path {
        if !p.is_empty() {
            dialog = dialog.set_directory(p);
        }
    }
    let res = dialog.pick_folder().await;
    Ok(res.map(|h| h.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn get_extension_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = embedded_extension::get_extension_export_dir(&app)?;
    embedded_extension::extract_extension_assets(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct SystemDirectories {
    download_dir: String,
    temp_dir: String,
    system_ffmpeg_path: Option<String>,
}

#[tauri::command]
fn get_system_directories(app: tauri::AppHandle) -> Result<SystemDirectories, String> {
    let download_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
        .to_string_lossy()
        .to_string();

    let temp_dir = app
        .path()
        .app_cache_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("Temp")
        .to_string_lossy()
        .to_string();

    let system_ffmpeg_path = find_system_ffmpeg();

    Ok(SystemDirectories {
        download_dir,
        temp_dir,
        system_ffmpeg_path,
    })
}

fn find_system_ffmpeg() -> Option<String> {
    let exe_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for part in path_var.split(separator) {
            let p = std::path::Path::new(part).join(exe_name);
            if p.is_file() {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }

    #[cfg(unix)]
    {
        for standard_path in &["/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"] {
            let p = std::path::Path::new(standard_path);
            if p.is_file() {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[tauri::command]
async fn check_ffmpeg_installed(state: State<'_, AppState>) -> Result<bool, String> {
    let custom = state.manager.get_ffmpeg_path().await;
    if let Some(c) = custom {
        if !c.trim().is_empty() && std::path::Path::new(&c).exists() {
            return Ok(true);
        }
    }
    Ok(find_system_ffmpeg().is_some())
}

#[tauri::command]
fn sync_appimage_filename(_new_version: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(appimage_path) = std::env::var("APPIMAGE") {
            let path = std::path::PathBuf::from(&appimage_path);
            if let (Some(parent), Some(file_name)) = (path.parent(), path.file_name()) {
                let name_str = file_name.to_string_lossy();
                if name_str.ends_with(".AppImage") && !name_str.contains(&_new_version) {
                    // Reemplazo limpio y robusto del patrón de versión sin dependencias externas
                    // Formato habitual: Ultra.Downloader_0.2.1_amd64.AppImage
                    let new_file_name = if let (Some(start_idx), Some(end_idx)) = (name_str.find('_'), name_str.rfind('_')) {
                        if start_idx < end_idx {
                            format!("{}_{}_{}", &name_str[..start_idx], _new_version, &name_str[end_idx + 1..])
                        } else {
                            format!("Ultra.Downloader_{}_amd64.AppImage", _new_version)
                        }
                    } else {
                        format!("Ultra.Downloader_{}_amd64.AppImage", _new_version)
                    };

                    let new_path = parent.join(&new_file_name);
                    if let Ok(_) = std::fs::rename(&path, &new_path) {
                        return Ok(Some(new_path.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
async fn open_aux_window(
    app: tauri::AppHandle,
    window_type: String,
    task_id: Option<String>,
    initial_url: Option<String>,
    audio_url: Option<String>,
    suggested_filename: Option<String>,
) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let label = match window_type.as_str() {
        "file-info" => "win-file-info".to_string(),
        "progress" => format!("win-progress-{}", task_id.clone().unwrap_or_else(|| "active".into())),
        "complete" => format!("win-complete-{}", task_id.clone().unwrap_or_else(|| "done".into())),
        "settings" => "win-settings".to_string(),
        "updater" => "win-updater".to_string(),
        _ => return Err("Invalid window type".into()),
    };

    if let Some(existing) = app.get_webview_window(&label) {
        if window_type == "file-info" {
            let _ = existing.destroy();
        } else {
            let _ = existing.unminimize();
            let _ = existing.show();
            let _ = existing.set_always_on_top(true);
            let _ = existing.set_focus();
            let _ = existing.set_always_on_top(false);
            return Ok(());
        }
    }

    let initial_title = match window_type.as_str() {
        "file-info" => "Download File Info".to_string(),
        "progress" => suggested_filename.clone().unwrap_or_else(|| "Download Progress".to_string()),
        "complete" => "Download Complete".to_string(),
        "settings" => "Options".to_string(),
        "updater" => "UPDATER".to_string(),
        _ => return Err("Invalid window type".into()),
    };

    let (width, height, resizable) = match window_type.as_str() {
        "file-info" => (620.0, 300.0, false),
        "progress" => (580.0, 580.0, true),
        "complete" => (520.0, 260.0, false),
        "settings" => (620.0, 480.0, false),
        "updater" => (460.0, 300.0, false),
        _ => return Err("Invalid window type".into()),
    };

    let mut query = format!("?view={}", window_type);
    if let Some(id) = task_id {
        query.push_str(&format!("&task_id={}", urlencoding_param(&id)));
    }
    if let Some(u) = initial_url {
        query.push_str(&format!("&initial_url={}", urlencoding_param(&u)));
    }
    if let Some(au) = audio_url {
        query.push_str(&format!("&audio_url={}", urlencoding_param(&au)));
    }
    if let Some(fn_val) = suggested_filename {
        query.push_str(&format!("&suggested_filename={}", urlencoding_param(&fn_val)));
    }

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(query.into()))
        .title(&initial_title)
        .inner_size(width, height)
        .resizable(resizable)
        .decorations(false)
        .center()
        .always_on_top(true)
        .visible(true);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone()).map_err(|e| e.to_string())?;
    } else {
        const ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
        if let Ok(img) = tauri::image::Image::from_bytes(ICON_BYTES) {
            builder = builder.icon(img).map_err(|e| e.to_string())?;
        }
    }

    let win = builder.build().map_err(|e| e.to_string())?;
    force_square_corners(&win);
    let _ = win.unminimize();
    let _ = win.set_focus();

    let win_clone = win.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let _ = win_clone.set_always_on_top(false);
    });

    Ok(())
}

#[tauri::command]
async fn close_aux_window(
    app: tauri::AppHandle,
    label: String,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.destroy();
    }
    Ok(())
}

#[tauri::command]
fn hide_tray_menu(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
}

fn urlencoding_param(val: &str) -> String {
    url::form_urlencoded::byte_serialize(val.as_bytes()).collect()
}

fn handle_deep_link(app: &AppHandle, raw_url: &str) {
    let mut extracted_url = String::new();
    let mut extracted_audio: Option<String> = None;
    let mut extracted_filename: Option<String> = None;

    if let Ok(parsed) = url::Url::parse(raw_url) {
        if parsed.scheme() == "udm" {
            if let Some((_, b64_data)) = parsed.query_pairs().find(|(k, _)| k == "data") {
                use base64::Engine;
                let engine = base64::engine::general_purpose::STANDARD;
                if let Ok(bytes) = engine.decode(b64_data.as_bytes()) {
                    if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                        extracted_url = json_val.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                        extracted_audio = json_val.get("audio_url").and_then(|v| v.as_str()).map(|s| s.to_string());
                        extracted_filename = json_val.get("filename").and_then(|v| v.as_str()).map(|s| s.to_string());
                        let _ = app.emit("browser-download-intercepted", json_val);
                    }
                }
            }

            if extracted_url.is_empty() {
                if let Some((_, direct_url)) = parsed.query_pairs().find(|(k, _)| k == "url") {
                    extracted_url = direct_url.to_string();
                    let json_val = serde_json::json!({ "url": direct_url });
                    let _ = app.emit("browser-download-intercepted", json_val);
                }
            }

            if extracted_url.is_empty() {
                let path = parsed.path();
                let full_str = raw_url.strip_prefix("udm://").unwrap_or(path);
                if full_str.starts_with("http://") || full_str.starts_with("https://") {
                    extracted_url = full_str.to_string();
                    let json_val = serde_json::json!({ "url": full_str });
                    let _ = app.emit("browser-download-intercepted", json_val);
                }
            }
        }
    }

    if !extracted_url.is_empty() {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = open_aux_window(
                app_clone,
                "file-info".to_string(),
                None,
                Some(extracted_url),
                extracted_audio,
                extracted_filename,
            ).await;
        });
    }
}

#[tauri::command]
fn window_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::WebviewWindow) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn restore_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let win_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            let _ = win_clone.set_always_on_top(false);
        });
    }
}

#[tauri::command]
fn window_close(window: tauri::WebviewWindow) {
    if window.label() == "main" {
        let _ = window.hide();
    } else {
        let _ = window.close();
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let mut has_link = false;
            for arg in &argv {
                if arg.starts_with("udm://") {
                    has_link = true;
                    handle_deep_link(app, arg);
                }
            }

            if !has_link {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let _ = app.deep_link().register_all();

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&app_handle, url.as_str());
                }
            });

            let app_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = app_dir.join("udm_state.db");
            let storage = Arc::new(StateStorage::new(db_path)?);
            let manager = Arc::new(DownloadManager::new(storage));
            let server_state = Arc::new(BrowserServerState::new());

            let config_handle = Arc::clone(&server_state.config);
            tauri::async_runtime::spawn(async move {
                server::start_browser_bridge_server(DEFAULT_SERVER_PORT, config_handle).await;
            });

            app.manage(AppState {
                manager,
                server_state,
            });

            let is_autostart_boot = std::env::args().any(|arg| arg == "--autostart");

            let mut main_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::default()
            )
            .title("Ultra Downloader")
            .inner_size(1050.0, 680.0)
            .min_inner_size(800.0, 500.0)
            .resizable(true)
            .decorations(false)
            .visible(!is_autostart_boot);

            if let Some(icon) = app.default_window_icon() {
                main_builder = main_builder.icon(icon.clone())?;
            } else {
                const ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
                if let Ok(img) = tauri::image::Image::from_bytes(ICON_BYTES) {
                    main_builder = main_builder.icon(img)?;
                }
            }

            let main_win = main_builder.build()?;
            force_square_corners(&main_win);

            tray::setup_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused && window.label() == "tray-menu" {
                    let _ = window.hide();
                }
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            probe_url,
            get_tasks,
            get_task,
            add_task,
            start_download,
            pause_download,
            delete_task,
            set_speed_limiter,
            open_aux_window,
            close_aux_window,
            pick_folder,
            get_system_directories,
            exit_app,
            restore_main_window,
            hide_tray_menu,
            window_minimize,
            window_toggle_maximize,
            window_close,
            sync_browser_config,
            set_ffmpeg_path,
            get_extension_path,
            set_autostart,
            is_autostart,
            check_ffmpeg_installed,
            sync_appimage_filename
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
