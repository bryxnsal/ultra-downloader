use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    let add_download = MenuItem::with_id(handle, "add_download", "Add new download...", true, None::<&str>)?;
    let pause_all = MenuItem::with_id(handle, "pause_all", "Pause all", true, None::<&str>)?;
    let stop_all = MenuItem::with_id(handle, "stop_all", "Stop all", true, None::<&str>)?;

    let limiter_on = MenuItem::with_id(handle, "limiter_on", "Turn on", true, None::<&str>)?;
    let limiter_off = MenuItem::with_id(handle, "limiter_off", "Turn off", true, None::<&str>)?;
    let limiter_sub = Submenu::with_items(handle, "Speed Limiter", true, &[&limiter_on, &limiter_off])?;

    let options = MenuItem::with_id(handle, "options", "Options...", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(handle)?;
    let sep2 = PredefinedMenuItem::separator(handle)?;
    let sep3 = PredefinedMenuItem::separator(handle)?;
    let sep4 = PredefinedMenuItem::separator(handle)?;
    let exit = MenuItem::with_id(handle, "exit", "Exit Ultra Downloader", true, None::<&str>)?;

    let _menu = Menu::with_items(
        handle,
        &[
            &add_download,
            &sep1,
            &pause_all,
            &stop_all,
            &sep2,
            &limiter_sub,
            &sep3,
            &options,
            &sep4,
            &exit,
        ],
    )?;

    let icon = match app.default_window_icon() {
        Some(i) => i.clone(),
        None => {
            const ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
            tauri::image::Image::from_bytes(ICON_BYTES)?
        }
    };

    let _tray = TrayIconBuilder::with_id("ultra-tray")
        .icon(icon)
        .show_menu_on_left_click(false)
        .tooltip("Ultra Downloader")
        .on_menu_event(|app: &AppHandle, event| {
            match event.id().as_ref() {
                "add_download" => {
                    let _ = app.emit("tray-add-download", ());
                }
                "pause_all" => {
                    let _ = app.emit("tray-pause-all", ());
                }
                "stop_all" => {
                    let _ = app.emit("tray-stop-all", ());
                }
                "limiter_on" => {
                    let _ = app.emit("tray-limiter-toggle", true);
                }
                "limiter_off" => {
                    let _ = app.emit("tray-limiter-toggle", false);
                }
                "options" => {
                    let _ = app.emit("tray-open-options", ());
                }
                "exit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => {
                    if let Some(tray_win) = app.get_webview_window("tray-menu") {
                        if tray_win.is_visible().unwrap_or(false) {
                            let _ = tray_win.hide();
                            return;
                        }
                    }

                    let menu_w = 200.0;
                    let menu_h = 240.0;
                    let margin = 12.0;

                    let (screen_w, screen_h) = if let Ok(Some(mon)) = app.primary_monitor() {
                        let size = mon.size();
                        (size.width as f64, size.height as f64)
                    } else {
                        (1920.0, 1080.0)
                    };

                    let x = if position.x + menu_w + margin > screen_w {
                        (position.x - menu_w - margin).max(margin)
                    } else if position.x - menu_w - margin < 0.0 {
                        (position.x + margin).min(screen_w - menu_w - margin)
                    } else {
                        (position.x - menu_w * 0.8).clamp(margin, screen_w - menu_w - margin)
                    };

                    let y = if position.y + menu_h + margin > screen_h {
                        (position.y - menu_h - margin).max(margin)
                    } else if position.y - menu_h - margin < 0.0 {
                        (position.y + margin).min(screen_h - menu_h - margin)
                    } else {
                        (position.y - menu_h - margin).max(margin)
                    };

                    if let Some(tray_win) = app.get_webview_window("tray-menu") {
                        let _ = tray_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x as i32, y as i32)));
                        crate::force_square_corners(&tray_win);
                        let _ = tray_win.show();
                        let _ = tray_win.set_focus();
                    } else {
                        if let Ok(tray_win) = tauri::WebviewWindowBuilder::new(
                            app,
                            "tray-menu",
                            tauri::WebviewUrl::App("?view=tray-menu".into()),
                        )
                        .title("Ultra Menu")
                        .inner_size(menu_w, menu_h)
                        .resizable(false)
                        .decorations(false)
                        .always_on_top(true)
                        .skip_taskbar(true)
                        .visible(true)
                        .position(x, y)
                        .build() {
                            crate::force_square_corners(&tray_win);
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
