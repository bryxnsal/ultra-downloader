use tauri::AppHandle;

const AUTOSTART_ARG: &str = "--autostart";

pub fn validate_enable() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let path = exe.to_string_lossy();
        if path.contains("/AppTranslocation/") || path.starts_with("/Volumes/") {
            return Err(
                "Move Ultra Downloader to /Applications before enabling autostart.".to_string(),
            );
        }
    }

    Ok(())
}

pub fn normalize_enabled(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows::quote_run_value(app);
    }

    #[cfg(target_os = "linux")]
    {
        return linux::rewrite_desktop_entry(app);
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = app;
        Ok(())
    }
}

pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    if !app.autolaunch().is_enabled().map_err(|e| e.to_string())? {
        return Ok(false);
    }

    #[cfg(target_os = "windows")]
    {
        return windows::is_enabled(app);
    }

    #[cfg(target_os = "linux")]
    {
        return linux::is_enabled(app);
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Ok(true)
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = app;
        Ok(true)
    }
}

#[cfg(target_os = "windows")]
fn command_path(command: &str) -> String {
    let mut value = command.trim();
    if let Some(stripped) = value.strip_suffix(AUTOSTART_ARG) {
        value = stripped.trim();
    }
    value.trim_matches('"').to_string()
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::path::Path;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

    pub fn quote_run_value(app: &AppHandle) -> Result<(), String> {
        let value_name = app.package_info().name.clone();
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let command = format!("\"{}\" {}", exe.display(), AUTOSTART_ARG);
        let mut updated = false;

        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let root_key = RegKey::predef(root);
            let Ok(read_run) = root_key.open_subkey_with_flags(RUN_KEY, KEY_READ) else {
                continue;
            };
            if read_run.get_value::<String, _>(&value_name).is_err() {
                continue;
            }

            let Ok(run) = root_key.open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_WRITE) else {
                continue;
            };
            if run.set_value(&value_name, &command).is_ok() {
                updated = true;
            }
        }

        if updated {
            Ok(())
        } else {
            Err("The Windows startup entry was not created.".to_string())
        }
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        let value_name = app.package_info().name.clone();

        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let Ok(run) = RegKey::predef(root).open_subkey_with_flags(RUN_KEY, KEY_READ) else {
                continue;
            };
            let Ok(command) = run.get_value::<String, _>(&value_name) else {
                continue;
            };

            let path = command_path(&command);
            if !path.is_empty() && Path::new(&path).exists() {
                return Ok(true);
            }
        }

        Ok(false)
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tauri::Manager;

    fn desktop_path(app: &AppHandle) -> Result<PathBuf, String> {
        let config_dir = app
            .path()
            .config_dir()
            .map_err(|e| format!("Could not resolve the user config directory: {e}"))?;
        let name = app.package_info().name.clone();
        Ok(config_dir.join("autostart").join(format!("{name}.desktop")))
    }

    fn launch_path() -> Result<PathBuf, String> {
        if let Some(appimage) = std::env::var_os("APPIMAGE") {
            let path = PathBuf::from(appimage);
            if path.exists() {
                return Ok(path.canonicalize().unwrap_or(path));
            }
        }

        std::env::current_exe().map_err(|e| e.to_string())
    }

    fn escape_exec(path: &str) -> String {
        let mut out = String::with_capacity(path.len() + 2);
        out.push('"');
        for ch in path.chars() {
            match ch {
                '\\' => out.push_str("\\\\"),
                '"' => out.push_str("\\\""),
                '`' => out.push_str("\\`"),
                '$' => out.push_str("\\$"),
                '%' => out.push_str("%%"),
                _ => out.push(ch),
            }
        }
        out.push('"');
        out
    }

    fn parse_exec_path(value: &str) -> Option<String> {
        let value = value.trim();
        if let Some(rest) = value.strip_prefix('"') {
            let mut out = String::new();
            let mut chars = rest.chars();
            while let Some(ch) = chars.next() {
                match ch {
                    '\\' => {
                        if let Some(next) = chars.next() {
                            out.push(next);
                        }
                    }
                    '"' => return Some(out),
                    '%' => {
                        if let Some(next) = chars.next() {
                            out.push('%');
                            if next != '%' {
                                out.push(next);
                            }
                        }
                    }
                    _ => out.push(ch),
                }
            }
            return None;
        }

        value.split_whitespace().next().map(ToString::to_string)
    }

    pub fn rewrite_desktop_entry(app: &AppHandle) -> Result<(), String> {
        let path = desktop_path(app)?;
        let parent = path
            .parent()
            .ok_or_else(|| "Could not resolve the autostart directory".to_string())?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;

        let executable = launch_path()?;
        let executable = executable.to_string_lossy();
        let name = app.package_info().name.clone();

        let content = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name={name}\n\
             Comment=Start Ultra Downloader in the system tray\n\
             Exec={} {AUTOSTART_ARG}\n\
             Terminal=false\n\
             Hidden=false\n\
             X-GNOME-Autostart-enabled=true\n",
            escape_exec(&executable)
        );

        fs::write(&path, content).map_err(|e| format!("Could not write {}: {e}", path.display()))
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        let path = desktop_path(app)?;
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => return Ok(false),
        };

        let mut hidden = false;
        let mut gnome_enabled = true;
        let mut executable: Option<String> = None;

        for line in content.lines() {
            let line = line.trim();
            if let Some(value) = line.strip_prefix("Hidden=") {
                hidden = value.trim().eq_ignore_ascii_case("true");
            } else if let Some(value) = line.strip_prefix("X-GNOME-Autostart-enabled=") {
                gnome_enabled = !value.trim().eq_ignore_ascii_case("false");
            } else if let Some(value) = line.strip_prefix("Exec=") {
                executable = parse_exec_path(value);
            }
        }

        if hidden || !gnome_enabled {
            return Ok(false);
        }

        match executable {
            Some(executable) => Ok(Path::new(&executable).exists()),
            None => Ok(false),
        }
    }
}
