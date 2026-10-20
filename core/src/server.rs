use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::RwLock;

pub const DEFAULT_SERVER_PORT: u16 = 51248;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomThemeDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "bgPrimary")]
    pub bg_primary: String,
    #[serde(rename = "bgSecondary")]
    pub bg_secondary: String,
    #[serde(rename = "bgSurface")]
    pub bg_surface: String,
    pub border: String,
    #[serde(rename = "textMain")]
    pub text_main: String,
    #[serde(rename = "textMuted")]
    pub text_muted: String,
    pub accent: String,
    #[serde(rename = "accentMuted", default)]
    pub accent_muted: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBridgeConfig {
    #[serde(rename = "interceptExtensions")]
    pub intercept_extensions: String,
    #[serde(rename = "exceptionServers")]
    pub exception_servers: String,
    #[serde(rename = "grabberTheme")]
    pub grabber_theme: String,
    #[serde(rename = "appTheme", default = "default_theme")]
    pub app_theme: String,
    #[serde(rename = "colorMode", default = "default_color_mode")]
    pub color_mode: String,
    #[serde(rename = "customThemes", default)]
    pub custom_themes: Vec<CustomThemeDto>,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_theme() -> String {
    "matrix".to_string()
}

fn default_color_mode() -> String {
    "dark".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

impl Default for BrowserBridgeConfig {
    fn default() -> Self {
        Self {
            intercept_extensions: "3GP 7Z AAC ACE AVI BIN BZ2 EXE GZ GZIP IMG ISO LZH M4A M4V MKV MOV MP3 MP4 MSI PDF RAR TAR ZIP".to_string(),
            exception_servers: "*.update.microsoft.com download.windowsupdate.com siteseal.thawte.com".to_string(),
            grabber_theme: "same_as_app".to_string(),
            app_theme: "matrix".to_string(),
            color_mode: "dark".to_string(),
            custom_themes: Vec::new(),
            language: "en".to_string(),
        }
    }
}

pub struct BrowserServerState {
    pub config: Arc<RwLock<BrowserBridgeConfig>>,
}

impl BrowserServerState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(BrowserBridgeConfig::default())),
        }
    }
}

fn is_allowed_origin(origin: &str) -> bool {
    let lower = origin.to_ascii_lowercase();
    lower.starts_with("chrome-extension://")
        || lower.starts_with("moz-extension://")
        || lower.starts_with("http://localhost")
        || lower.starts_with("http://127.0.0.1")
        || lower.starts_with("tauri://")
}

pub async fn start_browser_bridge_server(
    port: u16,
    config_state: Arc<RwLock<BrowserBridgeConfig>>,
) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            tracing::info!("[Ultra Bridge Server] Listening on http://{}", addr);
            l
        }
        Err(e) => {
            tracing::warn!("[Ultra Bridge Server] Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    loop {
        let (mut socket, _peer_addr) = match listener.accept().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::debug!("[Ultra Bridge Server] Connection error: {}", e);
                continue;
            }
        };

        let config_clone = Arc::clone(&config_state);

        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            let bytes_read = match socket.read(&mut buf).await {
                Ok(n) if n > 0 => n,
                _ => return,
            };

            let req_str = String::from_utf8_lossy(&buf[..bytes_read]);
            let lines: Vec<&str> = req_str.lines().collect();
            if lines.is_empty() {
                return;
            }

            let first_line = lines[0];
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() < 2 {
                return;
            }

            let method = parts[0];
            let raw_path = parts[1];
            let path = raw_path.split('?').next().unwrap_or(raw_path);

            let mut origin: Option<&str> = None;
            for line in &lines[1..] {
                if line.trim().is_empty() {
                    break;
                }
                if let Some(pos) = line.find(':') {
                    let header_name = line[..pos].trim();
                    let header_val = line[pos + 1..].trim();
                    if header_name.eq_ignore_ascii_case("Origin") {
                        origin = Some(header_val);
                    }
                }
            }

            let allow_origin = match origin {
                Some(orig) if is_allowed_origin(orig) => orig,
                Some(_) => {
                    let response = "HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden";
                    let _ = socket.write_all(response.as_bytes()).await;
                    let _ = socket.flush().await;
                    return;
                }
                None => "*",
            };

            if method.eq_ignore_ascii_case("OPTIONS") {
                let resp = format!(
                    "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: {}\r\n\
                    Access-Control-Allow-Methods: GET, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type, Accept\r\n\
                    Access-Control-Max-Age: 86400\r\n\
                    Content-Length: 0\r\n\
                    Connection: close\r\n\r\n",
                    allow_origin
                );
                let _ = socket.write_all(resp.as_bytes()).await;
                let _ = socket.flush().await;
                return;
            }

            if method.eq_ignore_ascii_case("GET") {
                match path {
                    "/api/config" => {
                        let current_config = {
                            let lock = config_clone.read().await;
                            lock.clone()
                        };

                        let body = serde_json::to_string(&current_config).unwrap_or_else(|_| "{}".to_string());
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\n\
                            Content-Type: application/json; charset=utf-8\r\n\
                            Access-Control-Allow-Origin: {}\r\n\
                            Content-Length: {}\r\n\
                            Connection: close\r\n\r\n{}",
                            allow_origin,
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(resp.as_bytes()).await;
                        let _ = socket.flush().await;
                    }
                    "/health" | "/api/health" => {
                        let body = r#"{"status":"ok","app":"ultra-downloader"}"#;
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\n\
                            Content-Type: application/json; charset=utf-8\r\n\
                            Access-Control-Allow-Origin: {}\r\n\
                            Content-Length: {}\r\n\
                            Connection: close\r\n\r\n{}",
                            allow_origin,
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(resp.as_bytes()).await;
                        let _ = socket.flush().await;
                    }
                    _ => {
                        let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found";
                        let _ = socket.write_all(not_found.as_bytes()).await;
                        let _ = socket.flush().await;
                    }
                }
            } else {
                let not_allowed = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = socket.write_all(not_allowed.as_bytes()).await;
                let _ = socket.flush().await;
            }
        });
    }
}
