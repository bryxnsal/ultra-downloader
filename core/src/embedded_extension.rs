use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const EXT_MANIFEST: &str = include_str!("../../extension/manifest.json");
pub const EXT_BACKGROUND: &str = include_str!("../../extension/background.js");
pub const EXT_CONTENT: &str = include_str!("../../extension/content.js");
pub const EXT_INJECTED: &str = include_str!("../../extension/injected.js");
pub const EXT_PANEL_CSS: &str = include_str!("../../extension/panel.css");
pub const EXT_POPUP_HTML: &str = include_str!("../../extension/popup/popup.html");
pub const EXT_POPUP_JS: &str = include_str!("../../extension/popup/popup.js");

pub const ICON_32: &[u8] = include_bytes!("../../extension/icons/icon-32.png");
pub const ICON_48: &[u8] = include_bytes!("../../extension/icons/icon-48.png");
pub const ICON_128: &[u8] = include_bytes!("../../extension/icons/icon-128.png");
pub const ICON_SVG: &[u8] = include_bytes!("../../extension/icons/logo.svg");

pub fn get_extension_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("ultra-downloader"));
    Ok(base_dir.join("browser-extension"))
}

pub fn extract_extension_assets(dest_dir: &Path) -> Result<(), String> {
    let icons_dir = dest_dir.join("icons");
    let popup_dir = dest_dir.join("popup");

    std::fs::create_dir_all(&icons_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&popup_dir).map_err(|e| e.to_string())?;

    std::fs::write(dest_dir.join("manifest.json"), EXT_MANIFEST).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("background.js"), EXT_BACKGROUND).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("content.js"), EXT_CONTENT).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("injected.js"), EXT_INJECTED).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("panel.css"), EXT_PANEL_CSS).map_err(|e| e.to_string())?;

    std::fs::write(popup_dir.join("popup.html"), EXT_POPUP_HTML).map_err(|e| e.to_string())?;
    std::fs::write(popup_dir.join("popup.js"), EXT_POPUP_JS).map_err(|e| e.to_string())?;

    std::fs::write(icons_dir.join("icon-32.png"), ICON_32).map_err(|e| e.to_string())?;
    std::fs::write(icons_dir.join("icon-48.png"), ICON_48).map_err(|e| e.to_string())?;
    std::fs::write(icons_dir.join("icon-128.png"), ICON_128).map_err(|e| e.to_string())?;
    std::fs::write(icons_dir.join("logo.svg"), ICON_SVG).map_err(|e| e.to_string())?;

    Ok(())
}
