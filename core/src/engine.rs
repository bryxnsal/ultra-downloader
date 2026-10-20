use reqwest::header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_TYPE, RANGE};
use tokio::sync::watch;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::assembler::FileAssembler;
use crate::models::{ChunkInfo, UrlMetadata};

pub struct DownloadEngine {
    client: reqwest::Client,
}

impl DownloadEngine {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .tcp_nodelay(true)
            .tcp_keepalive(std::time::Duration::from_secs(30))
            .brotli(true)
            .gzip(true)
            .build()
            .unwrap_or_default();
        Self { client }
    }

    pub async fn probe_url(&self, url: &str) -> Result<UrlMetadata, String> {
        let is_yt = url.contains("googlevideo.com") || url.contains("youtube.com") || url.contains("youtu.be");

        let clean_probe_url = if is_yt && (url.contains("&range=") || url.contains("?range=") || url.contains("&begin=") || url.contains("?begin=")) {
            if let Ok(mut parsed) = url::Url::parse(url) {
                let filtered: Vec<(String, String)> = parsed
                    .query_pairs()
                    .filter(|(k, _)| k != "range" && k != "begin")
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect();
                parsed.query_pairs_mut().clear().extend_pairs(filtered.iter().map(|(k, v)| (k.as_str(), v.as_str())));
                parsed.to_string()
            } else {
                url.to_string()
            }
        } else {
            url.to_string()
        };
        
        let mut head_req = self.client.head(&clean_probe_url)
            .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
        if is_yt {
            head_req = head_req
                .header(reqwest::header::REFERER, "https://www.youtube.com/")
                .header(reqwest::header::ORIGIN, "https://www.youtube.com")
                .header("Sec-Fetch-Dest", "video")
                .header("Sec-Fetch-Mode", "no-cors")
                .header("Sec-Fetch-Site", "cross-site");
        }

        let resp = match head_req.send().await {
            Ok(r) if r.status().is_success() => r,
            _ => {
                let mut get_req = self.client
                    .get(&clean_probe_url)
                    .header(RANGE, "bytes=0-0")
                    .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
                if is_yt {
                    get_req = get_req
                        .header(reqwest::header::REFERER, "https://www.youtube.com/")
                        .header(reqwest::header::ORIGIN, "https://www.youtube.com")
                        .header("Sec-Fetch-Dest", "video")
                        .header("Sec-Fetch-Mode", "no-cors")
                        .header("Sec-Fetch-Site", "cross-site");
                }
                get_req
                    .send()
                    .await
                    .map_err(|e| format!("Network probe failed: {}", e))?
            }
        };

        let accepts_ranges = resp
            .headers()
            .get(ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_lowercase() == "bytes")
            .unwrap_or_else(|| {
                resp.status() == reqwest::StatusCode::PARTIAL_CONTENT
            });

        let mut content_length = if let Some(len) = resp
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
        {
            if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                resp.headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|cr| cr.split('/').last())
                    .and_then(|total| total.parse::<u64>().ok())
                    .or(Some(len))
            } else {
                Some(len)
            }
        } else {
            None
        };

        if content_length.is_none() && is_yt {
            if let Ok(parsed) = url::Url::parse(url) {
                if let Some((_, clen_val)) = parsed.query_pairs().find(|(k, _)| k == "clen") {
                    if let Ok(c) = clen_val.parse::<u64>() {
                        content_length = Some(c);
                    }
                }
            }
        }

        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let suggested_filename = resp
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(|cd| {
                cd.split("filename=")
                    .nth(1)
                    .map(|f| f.trim_matches(|c| c == '"' || c == '\'').to_string())
            })
            .unwrap_or_else(|| {
                url.split('/')
                    .last()
                    .unwrap_or("download.bin")
                    .split('?')
                    .next()
                    .unwrap_or("download.bin")
                    .to_string()
            });

        Ok(UrlMetadata {
            url: url.to_string(),
            audio_url: None,
            suggested_filename,
            content_length,
            accepts_ranges,
            content_type,
        })
    }

    pub fn calculate_chunks(total_bytes: u64, num_connections: usize) -> Vec<ChunkInfo> {
        if total_bytes == 0 || num_connections <= 1 {
            return vec![ChunkInfo {
                id: 0,
                start_byte: 0,
                current_byte: 0,
                end_byte: total_bytes.saturating_sub(1),
                downloaded_bytes: 0,
                speed_bytes_sec: 0,
                active: true,
                is_completed: false,
            }];
        }

        let chunk_size = total_bytes / (num_connections as u64);
        let mut chunks = Vec::with_capacity(num_connections);

        for i in 0..num_connections {
            let start = (i as u64) * chunk_size;
            let end = if i == num_connections - 1 {
                total_bytes - 1
            } else {
                start + chunk_size - 1
            };

            chunks.push(ChunkInfo {
                id: i,
                start_byte: start,
                current_byte: start,
                end_byte: end,
                downloaded_bytes: 0,
                speed_bytes_sec: 0,
                active: true,
                is_completed: false,
            });
        }

        chunks
    }

    pub async fn download_chunk_worker(
        client: reqwest::Client,
        url: String,
        dest_path: String,
        chunk_id: usize,
        start_byte: u64,
        initial_end_byte: u64,
        progress_tx: tokio::sync::mpsc::Sender<(usize, u64, bool)>,
        cancel_rx: watch::Receiver<bool>,
        bound_rx: watch::Receiver<u64>,
        limiter: std::sync::Arc<crate::limiter::RateLimiter>,
    ) -> Result<(), String> {
        let mut file = FileAssembler::open_for_chunk_write(&dest_path).await?;
        let mut current_offset = start_byte;
        let mut retry_count = 0;
        const MAX_RETRIES: u32 = 5;

        'retry_loop: while retry_count < MAX_RETRIES {
            let current_end = *bound_rx.borrow();
            if current_end > 0 && current_offset >= (current_end + 1) {
                break 'retry_loop;
            }

            let range_header = if current_end > 0 {
                format!("bytes={}-{}", current_offset, current_end)
            } else if initial_end_byte > 0 {
                format!("bytes={}-{}", current_offset, initial_end_byte)
            } else {
                format!("bytes={}-", current_offset)
            };

            let is_yt = url.contains("googlevideo.com") || url.contains("youtube.com") || url.contains("youtu.be");

            let clean_worker_url = if is_yt && (url.contains("&range=") || url.contains("?range=") || url.contains("&begin=") || url.contains("?begin=")) {
                if let Ok(mut parsed) = url::Url::parse(&url) {
                    let filtered: Vec<(String, String)> = parsed
                        .query_pairs()
                        .filter(|(k, _)| k != "range" && k != "begin")
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect();
                    parsed.query_pairs_mut().clear().extend_pairs(filtered.iter().map(|(k, v)| (k.as_str(), v.as_str())));
                    parsed.to_string()
                } else {
                    url.clone()
                }
            } else {
                url.clone()
            };

            let mut req = client
                .get(&clean_worker_url)
                .header(RANGE, range_header)
                .header(
                    reqwest::header::USER_AGENT,
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                );

            if is_yt {
                req = req
                    .header(reqwest::header::REFERER, "https://www.youtube.com/")
                    .header(reqwest::header::ORIGIN, "https://www.youtube.com")
                    .header("Sec-Fetch-Dest", "video")
                    .header("Sec-Fetch-Mode", "no-cors")
                    .header("Sec-Fetch-Site", "cross-site");
            }

            let response = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[Worker {}] Request error: {:?}, retrying...", chunk_id, e);
                    retry_count += 1;
                    if *cancel_rx.borrow() {
                        return Ok(());
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << retry_count))).await;
                    continue 'retry_loop;
                }
            };

            if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                eprintln!("[Worker {}] Server returned HTTP {}: {}", chunk_id, response.status(), url);
                retry_count += 1;
                tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << retry_count))).await;
                continue 'retry_loop;
            }

            retry_count = 0;
            let mut stream = response.bytes_stream();

            while let Some(chunk_res) = stream.next().await {
                if *cancel_rx.borrow() {
                    return Ok(());
                }

                let bytes = match chunk_res {
                    Ok(b) => b,
                    Err(_) => {
                        retry_count += 1;
                        tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << retry_count))).await;
                        continue 'retry_loop;
                    }
                };

                let mut len = bytes.len() as u64;
                let current_end_byte = *bound_rx.borrow();

                if current_end_byte > 0 && current_offset + len > (current_end_byte + 1) {
                    len = (current_end_byte + 1).saturating_sub(current_offset);
                }

                if len > 0 {
                    limiter.acquire(len as usize).await;

                    FileAssembler::write_at(&mut file, current_offset, &bytes[..len as usize]).await?;
                    current_offset += len;
                }

                let is_finished = current_end_byte > 0 && current_offset >= (current_end_byte + 1);
                let _ = progress_tx.send((chunk_id, len, is_finished)).await;

                if is_finished {
                    break 'retry_loop;
                }
            }

            break 'retry_loop;
        }

        let _ = file.flush().await;
        let _ = file.sync_data().await;
        drop(file);

        let _ = progress_tx.send((chunk_id, 0, true)).await;
        Ok(())
    }
}
