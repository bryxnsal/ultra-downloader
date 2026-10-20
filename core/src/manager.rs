use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch, Mutex, RwLock};

use crate::assembler::FileAssembler;
use crate::engine::DownloadEngine;
use crate::limiter::RateLimiter;
use crate::models::{DownloadProgressPayload, DownloadStatus, DownloadTask};
use crate::storage::StateStorage;

struct TaskController {
    cancel_tx: watch::Sender<bool>,
    #[allow(dead_code)]
    chunk_bounds: Arc<Mutex<HashMap<usize, watch::Sender<u64>>>>,
}

pub struct DownloadManager {
    engine: Arc<DownloadEngine>,
    storage: Arc<StateStorage>,
    limiter: Arc<RateLimiter>,
    tasks: Arc<RwLock<HashMap<String, DownloadTask>>>,
    controllers: Arc<Mutex<HashMap<String, TaskController>>>,
    ffmpeg_path: Arc<RwLock<Option<String>>>,
}

impl DownloadManager {
    pub fn new(storage: Arc<StateStorage>) -> Self {
        let initial_tasks = storage.load_all_tasks().unwrap_or_default();
        let mut map = HashMap::new();
        for t in initial_tasks {
            map.insert(t.id.clone(), t);
        }

        Self {
            engine: Arc::new(DownloadEngine::new()),
            storage,
            limiter: Arc::new(RateLimiter::new(false, 2 * 1024 * 1024)),
            tasks: Arc::new(RwLock::new(map)),
            controllers: Arc::new(Mutex::new(HashMap::new())),
            ffmpeg_path: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_ffmpeg_path(&self, path: Option<String>) {
        let mut lock = self.ffmpeg_path.write().await;
        *lock = path;
    }

    pub async fn get_ffmpeg_path(&self) -> Option<String> {
        let lock = self.ffmpeg_path.read().await;
        lock.clone()
    }

    pub fn limiter(&self) -> Arc<RateLimiter> {
        self.limiter.clone()
    }

    pub fn set_speed_limiter(&self, enabled: bool, speed_bytes_sec: Option<u64>) {
        self.limiter.set_enabled(enabled);
        if let Some(rate) = speed_bytes_sec {
            self.limiter.set_rate(rate);
        }
    }

    pub fn engine(&self) -> Arc<DownloadEngine> {
        self.engine.clone()
    }

    pub async fn get_tasks(&self) -> Vec<DownloadTask> {
        let lock = self.tasks.read().await;
        if let Ok(mut db_tasks) = self.storage.load_all_tasks() {
            for t in &mut db_tasks {
                if let Some(mem_task) = lock.get(&t.id) {
                    t.speed_bytes_sec = mem_task.speed_bytes_sec;
                    t.status = mem_task.status.clone();
                    t.chunks = mem_task.chunks.clone();
                    t.downloaded_bytes = mem_task.downloaded_bytes;
                    t.eta_seconds = mem_task.eta_seconds;
                }
            }
            return db_tasks;
        }

        let mut list: Vec<DownloadTask> = lock.values().cloned().collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    pub async fn get_task(&self, task_id: &str) -> Option<DownloadTask> {
        let lock = self.tasks.read().await;
        lock.get(task_id).cloned()
    }

    pub async fn add_task(
        &self,
        url: String,
        audio_url: Option<String>,
        filename: String,
        destination_path: String,
        connections: usize,
    ) -> Result<DownloadTask, String> {
        let meta = self.engine.probe_url(&url).await?;
        let total = meta.content_length.unwrap_or(0);
        let conns = if meta.accepts_ranges && total > 0 { connections } else { 1 };
        let chunks = DownloadEngine::calculate_chunks(total, conns);

        let task = DownloadTask {
            id: uuid::Uuid::new_v4().to_string(),
            url,
            audio_url,
            filename,
            destination_path,
            total_bytes: total,
            downloaded_bytes: 0,
            speed_bytes_sec: 0,
            status: DownloadStatus::Queued,
            supports_ranges: meta.accepts_ranges,
            connections_count: conns,
            chunks,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            eta_seconds: None,
        };

        let mut lock = self.tasks.write().await;
        lock.insert(task.id.clone(), task.clone());
        let _ = self.storage.save_task(&task);

        Ok(task)
    }

    pub async fn start_download(&self, task_id: &str, app: AppHandle) -> Result<(), String> {
        let task = {
            let mut lock = self.tasks.write().await;
            match lock.get_mut(task_id) {
                Some(t) => {
                    t.status = DownloadStatus::Downloading;
                    t.clone()
                }
                None => return Err(format!("Task {} not found", task_id)),
            }
        };

        FileAssembler::preallocate(&task.destination_path, task.total_bytes).await?;

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let chunk_bounds = Arc::new(Mutex::new(HashMap::<usize, watch::Sender<u64>>::new()));

        {
            let mut ctrl_lock = self.controllers.lock().await;
            ctrl_lock.insert(
                task_id.to_string(),
                TaskController {
                    cancel_tx,
                    chunk_bounds: chunk_bounds.clone(),
                },
            );
        }

        let (progress_tx, mut progress_rx) = mpsc::channel::<(usize, u64, bool)>(2048);

        let client = reqwest::Client::builder()
            .tcp_nodelay(true)
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        let worker_handles = Arc::new(tokio::sync::Mutex::new(Vec::new()));

        for chunk in &task.chunks {
            if chunk.is_completed {
                continue;
            }

            let (bound_tx, bound_rx) = watch::channel(chunk.end_byte);
            {
                let mut b_lock = chunk_bounds.lock().await;
                b_lock.insert(chunk.id, bound_tx);
            }

            let client_c = client.clone();
            let url_c = task.url.clone();
            let dest_c = task.destination_path.clone();
            let chunk_id = chunk.id;
            let start = chunk.current_byte;
            let end = chunk.end_byte;
            let tx_c = progress_tx.clone();
            let rx_c = cancel_rx.clone();
            let limiter_c = self.limiter.clone();

            let handle = tokio::spawn(async move {
                let _ = DownloadEngine::download_chunk_worker(
                    client_c, url_c, dest_c, chunk_id, start, end, tx_c, rx_c, bound_rx, limiter_c,
                ).await;
            });
            worker_handles.lock().await.push(handle);
        }

        let audio_handle = if let Some(ref a_url) = task.audio_url {
            let client_a = client.clone();
            let a_url_clone = a_url.clone();
            let audio_dest = format!("{}.audio.udmpart", &task.destination_path);
            let rx_a = cancel_rx.clone();

            Some(tokio::spawn(async move {
                if *rx_a.borrow() {
                    return Err("Cancelled".to_string());
                }

                let is_yt = a_url_clone.contains("googlevideo.com") || a_url_clone.contains("youtube.com");

                let clean_audio_url = if is_yt && (a_url_clone.contains("&range=") || a_url_clone.contains("?range=") || a_url_clone.contains("&begin=") || a_url_clone.contains("?begin=")) {
                    if let Ok(mut parsed) = url::Url::parse(&a_url_clone) {
                        let filtered: Vec<(String, String)> = parsed
                            .query_pairs()
                            .filter(|(k, _)| k != "range" && k != "begin")
                            .map(|(k, v)| (k.to_string(), v.to_string()))
                            .collect();
                        parsed.query_pairs_mut().clear().extend_pairs(filtered.iter().map(|(k, v)| (k.as_str(), v.as_str())));
                        parsed.to_string()
                    } else {
                        a_url_clone.clone()
                    }
                } else {
                    a_url_clone.clone()
                };

                let mut req = client_a.get(&clean_audio_url)
                    .header(reqwest::header::RANGE, "bytes=0-")
                    .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");

                if is_yt {
                    req = req
                        .header(reqwest::header::REFERER, "https://www.youtube.com/")
                        .header(reqwest::header::ORIGIN, "https://www.youtube.com")
                        .header("Sec-Fetch-Dest", "video")
                        .header("Sec-Fetch-Mode", "no-cors")
                        .header("Sec-Fetch-Site", "cross-site");
                }

                match req.send().await {
                    Ok(resp) if resp.status().is_success() || resp.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                        let mut audio_file = tokio::fs::OpenOptions::new()
                            .create(true)
                            .write(true)
                            .truncate(true)
                            .open(&audio_dest)
                            .await
                            .map_err(|e| format!("Failed to create audio file: {}", e))?;

                        use futures_util::StreamExt;
                        let mut stream = resp.bytes_stream();
                        while let Some(chunk_res) = stream.next().await {
                            if *rx_a.borrow() {
                                return Err("Cancelled".to_string());
                            }
                            match chunk_res {
                                Ok(chunk) => {
                                    use tokio::io::AsyncWriteExt;
                                    if let Err(e) = audio_file.write_all(&chunk).await {
                                        return Err(format!("Failed to write audio chunk: {}", e));
                                    }
                                }
                                Err(e) => return Err(format!("Audio stream error: {}", e)),
                            }
                        }
                        use tokio::io::AsyncWriteExt;
                        let _ = audio_file.flush().await;
                        let _ = audio_file.sync_data().await;
                        drop(audio_file);

                        Ok(audio_dest)
                    }
                    Ok(resp) => Err(format!("Audio server HTTP {}", resp.status())),
                    Err(e) => Err(format!("Audio request failed: {}", e)),
                }
            }))
        } else {
            None
        };

        let tasks_ref = self.tasks.clone();
        let chunk_bounds_ref = chunk_bounds.clone();
        let cancel_rx_sup = cancel_rx.clone();
        let client_sup = client.clone();
        let progress_tx_sup = progress_tx.clone();
        let task_id_str = task_id.to_string();
        let supports_ranges = task.supports_ranges;
        let dest_path_sup = task.destination_path.clone();
        let url_sup = task.url.clone();
        let limiter_sup = self.limiter.clone();
        let worker_handles_sup = worker_handles.clone();
        let ffmpeg_path_ref = self.ffmpeg_path.clone();

        if supports_ranges && task.total_bytes > 0 {
            let tasks_sup = tasks_ref.clone();
            let task_id_sup = task_id_str.clone();
            let limiter_for_sup = limiter_sup.clone();

            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(500));
                loop {
                    interval.tick().await;

                    if *cancel_rx_sup.borrow() {
                        break;
                    }

                    let mut lock = tasks_sup.write().await;
                    let current_task = match lock.get_mut(&task_id_sup) {
                        Some(t) if t.status == DownloadStatus::Downloading => t,
                        _ => break,
                    };

                    let active_count = current_task.chunks.iter().filter(|c| c.active && !c.is_completed).count();
                    let all_chunks_done = current_task.chunks.iter().all(|c| c.is_completed)
                        || (current_task.total_bytes > 0 && current_task.downloaded_bytes >= current_task.total_bytes);

                    if all_chunks_done || active_count == 0 {
                        break;
                    }

                    let max_conns = current_task.connections_count.max(8);

                    if active_count < max_conns {
                        let biggest_idx = current_task
                            .chunks
                            .iter()
                            .enumerate()
                            .filter(|(_, c)| c.active && !c.is_completed)
                            .max_by_key(|(_, c)| c.remaining_bytes())
                            .map(|(idx, _)| idx);

                        if let Some(target_idx) = biggest_idx {
                            let new_chunk_id = current_task.chunks.len();
                            if let Some(new_chunk) = current_task.chunks[target_idx].try_split(new_chunk_id) {
                                let updated_end_byte = current_task.chunks[target_idx].end_byte;

                                {
                                    let b_lock = chunk_bounds_ref.lock().await;
                                    if let Some(bound_tx) = b_lock.get(&current_task.chunks[target_idx].id) {
                                        let _ = bound_tx.send(updated_end_byte);
                                    }
                                }

                                let (new_bound_tx, new_bound_rx) = watch::channel(new_chunk.end_byte);
                                {
                                    let mut b_lock = chunk_bounds_ref.lock().await;
                                    b_lock.insert(new_chunk.id, new_bound_tx);
                                }

                                let client_w = client_sup.clone();
                                let url_w = url_sup.clone();
                                let dest_w = dest_path_sup.clone();
                                let c_id = new_chunk.id;
                                let c_start = new_chunk.start_byte;
                                let c_end = new_chunk.end_byte;
                                let tx_w = progress_tx_sup.clone();
                                let rx_w = cancel_rx_sup.clone();
                                let limiter_w = limiter_for_sup.clone();

                                current_task.chunks.push(new_chunk);

                                let handle = tokio::spawn(async move {
                                    let _ = DownloadEngine::download_chunk_worker(
                                        client_w, url_w, dest_w, c_id, c_start, c_end, tx_w, rx_w, new_bound_rx, limiter_w,
                                    ).await;
                                });
                                worker_handles_sup.lock().await.push(handle);
                            }
                        }
                    }
                }
            });
        }

        drop(progress_tx);

        let storage_ref = self.storage.clone();
        let controllers_ref = self.controllers.clone();
        let worker_handles_recv = worker_handles.clone();

        tokio::spawn(async move {
            let mut tick_timer = tokio::time::interval(Duration::from_millis(200));
            let mut last_checkpoint = Instant::now();
            let mut last_instant = Instant::now();
            let mut speed_samples: std::collections::VecDeque<(Instant, u64)> = std::collections::VecDeque::new();
            let mut chunk_bytes_delta: std::collections::HashMap<usize, u64> = std::collections::HashMap::new();
            let mut smoothed_speed: f64 = 0.0;
            let mut smoothed_eta: Option<u64> = None;

            loop {
                tokio::select! {
                    biased;

                    msg = progress_rx.recv() => {
                        match msg {
                            Some((chunk_id, bytes_len, is_done)) => {
                                *chunk_bytes_delta.entry(chunk_id).or_insert(0) += bytes_len;

                                let mut lock = tasks_ref.write().await;
                                if let Some(t) = lock.get_mut(&task_id_str) {
                                    t.downloaded_bytes = t.downloaded_bytes.saturating_add(bytes_len);
                                    if let Some(c) = t.chunks.get_mut(chunk_id) {
                                        c.downloaded_bytes = c.downloaded_bytes.saturating_add(bytes_len);
                                        c.current_byte = c.current_byte.saturating_add(bytes_len);
                                        c.is_completed = is_done;
                                        c.active = !is_done;
                                    }

                                    if last_checkpoint.elapsed() >= Duration::from_secs(2) {
                                        let _ = storage_ref.save_task(t);
                                        last_checkpoint = Instant::now();
                                    }

                                    let is_finished = (t.total_bytes > 0 && t.downloaded_bytes >= t.total_bytes)
                                        || (t.chunks.len() > 0 && t.chunks.iter().all(|c| c.is_completed));
                                    if is_finished {
                                        break;
                                    }
                                }
                            }
                            None => {
                                break;
                            }
                        }
                    }

                    _ = tick_timer.tick() => {
                        let now = Instant::now();
                        let dt = now.duration_since(last_instant).as_secs_f64();
                        last_instant = now;

                        let mut lock = tasks_ref.write().await;
                        if let Some(t) = lock.get_mut(&task_id_str) {
                            let total_delta: u64 = chunk_bytes_delta.values().sum();
                            speed_samples.push_back((now, total_delta));

                            while let Some((time, _)) = speed_samples.front() {
                                if now.duration_since(*time) > Duration::from_millis(1500) {
                                    speed_samples.pop_front();
                                } else {
                                    break;
                                }
                            }

                            let window_bytes: u64 = speed_samples.iter().map(|(_, b)| *b).sum();
                            let window_duration = if let Some((first_time, _)) = speed_samples.front() {
                                let dur = now.duration_since(*first_time).as_secs_f64();
                                if dur > 0.05 { dur } else { dt }
                            } else {
                                dt
                            };

                            let instant_speed = if window_duration > 0.0 {
                                window_bytes as f64 / window_duration
                            } else {
                                0.0
                            };

                            if smoothed_speed == 0.0 {
                                smoothed_speed = instant_speed;
                            } else {
                                smoothed_speed = (0.35 * instant_speed) + (0.65 * smoothed_speed);
                            }

                            let final_speed = smoothed_speed.round() as u64;
                            t.speed_bytes_sec = final_speed;

                            if dt > 0.0 {
                                for (cid, c_bytes) in chunk_bytes_delta.drain() {
                                    if let Some(c) = t.chunks.get_mut(cid) {
                                        let c_speed = (c_bytes as f64 / dt).round() as u64;
                                        if c.speed_bytes_sec == 0 {
                                            c.speed_bytes_sec = c_speed;
                                        } else {
                                            c.speed_bytes_sec = ((0.4 * c_speed as f64) + (0.6 * c.speed_bytes_sec as f64)).round() as u64;
                                        }
                                    }
                                }
                            }

                            for c in t.chunks.iter_mut() {
                                if c.is_completed {
                                    c.speed_bytes_sec = 0;
                                } else if c.active && c.speed_bytes_sec > 0 {
                                    c.speed_bytes_sec = (c.speed_bytes_sec as f64 * 0.7).round() as u64;
                                }
                            }

                            if final_speed > 0 && t.total_bytes > t.downloaded_bytes {
                                let raw_eta = (t.total_bytes - t.downloaded_bytes) / final_speed;
                                smoothed_eta = match smoothed_eta {
                                    Some(prev) => {
                                        let diff = (raw_eta as i64 - prev as i64).abs();
                                        if diff > 10 {
                                            Some(((prev as f64 * 0.7) + (raw_eta as f64 * 0.3)).round() as u64)
                                        } else {
                                            Some(raw_eta)
                                        }
                                    }
                                    None => Some(raw_eta),
                                };
                                t.eta_seconds = smoothed_eta;
                            } else if t.total_bytes <= t.downloaded_bytes && t.total_bytes > 0 {
                                t.eta_seconds = Some(0);
                            }

                            let payload = DownloadProgressPayload {
                                task_id: t.id.clone(),
                                downloaded_bytes: t.downloaded_bytes,
                                total_bytes: t.total_bytes,
                                speed_bytes_sec: t.speed_bytes_sec,
                                eta_seconds: t.eta_seconds,
                                status: t.status.clone(),
                                chunks: t.chunks.clone(),
                            };
                            let _ = app.emit("download-progress", payload);
                        }
                    }
                }
            }

            let handles = {
                let mut h_lock = worker_handles_recv.lock().await;
                std::mem::take(&mut *h_lock)
            };
            for h in handles {
                let _ = h.await;
            }

            let (is_all_done, maybe_audio_url, dest_path) = {
                let mut lock = tasks_ref.write().await;
                if let Some(t) = lock.get_mut(&task_id_str) {
                    let all_done = t.chunks.iter().all(|c| c.is_completed)
                        || (t.total_bytes > 0 && t.downloaded_bytes >= t.total_bytes);

                    if all_done {
                        t.status = DownloadStatus::Assembling;
                        let _ = app.emit("download-progress", DownloadProgressPayload {
                            task_id: t.id.clone(),
                            downloaded_bytes: t.downloaded_bytes,
                            total_bytes: t.total_bytes,
                            speed_bytes_sec: 0,
                            eta_seconds: Some(0),
                            status: t.status.clone(),
                            chunks: t.chunks.clone(),
                        });
                        (true, t.audio_url.clone(), t.destination_path.clone())
                    } else if t.status == DownloadStatus::Downloading {
                        t.status = DownloadStatus::Paused;
                        t.speed_bytes_sec = 0;
                        let _ = storage_ref.save_task(t);
                        let _ = app.emit("download-progress", DownloadProgressPayload {
                            task_id: t.id.clone(),
                            downloaded_bytes: t.downloaded_bytes,
                            total_bytes: t.total_bytes,
                            speed_bytes_sec: 0,
                            eta_seconds: None,
                            status: t.status.clone(),
                            chunks: t.chunks.clone(),
                        });
                        (false, None, String::new())
                    } else {
                        (false, None, String::new())
                    }
                } else {
                    (false, None, String::new())
                }
            };

            if is_all_done {
                let audio_res: Result<(), String> = if maybe_audio_url.is_some() {
                    let audio_part = std::path::PathBuf::from(format!("{}.audio.udmpart", &dest_path));
                    let video_part = FileAssembler::get_part_path(&dest_path);
                    let final_path = std::path::PathBuf::from(&dest_path);

                    let audio_ready = if let Some(h) = audio_handle {
                        match h.await {
                            Ok(Ok(_)) => Ok(()),
                            Ok(Err(e)) => Err(e),
                            Err(e) => Err(format!("Audio task join error: {}", e)),
                        }
                    } else if audio_part.exists() {
                        Ok(())
                    } else {
                        Err("Audio stream was not found".to_string())
                    };

                    match audio_ready {
                        Ok(_) => {
                            let custom_ffmpeg = ffmpeg_path_ref.read().await.clone();
                            FileAssembler::mux_video_audio(
                                &video_part,
                                &audio_part,
                                &final_path,
                                custom_ffmpeg.as_deref(),
                            ).await
                        }
                        Err(e) => Err(format!("Failed to prepare audio: {}", e)),
                    }
                } else {
                    FileAssembler::finalize(&dest_path).await
                };

                let mut lock = tasks_ref.write().await;
                if let Some(t) = lock.get_mut(&task_id_str) {
                    if let Err(e) = audio_res {
                        t.status = DownloadStatus::Error(e);
                    } else {
                        t.status = DownloadStatus::Completed;
                        t.speed_bytes_sec = 0;
                        t.eta_seconds = Some(0);
                    }

                    let _ = storage_ref.save_task(t);

                    let _ = app.emit("download-complete", t.clone());
                    let _ = app.emit("download-progress", DownloadProgressPayload {
                        task_id: t.id.clone(),
                        downloaded_bytes: t.downloaded_bytes,
                        total_bytes: t.total_bytes,
                        speed_bytes_sec: t.speed_bytes_sec,
                        eta_seconds: t.eta_seconds,
                        status: t.status.clone(),
                        chunks: t.chunks.clone(),
                    });
                }
            }

            let mut ctrl_lock = controllers_ref.lock().await;
            ctrl_lock.remove(&task_id_str);
        });

        Ok(())
    }

    pub async fn pause_download(&self, task_id: &str, app: Option<&AppHandle>) -> Result<(), String> {
        let mut ctrl_lock = self.controllers.lock().await;
        if let Some(ctrl) = ctrl_lock.remove(task_id) {
            let _ = ctrl.cancel_tx.send(true);
        }

        let mut lock = self.tasks.write().await;
        if let Some(t) = lock.get_mut(task_id) {
            t.status = DownloadStatus::Paused;
            t.speed_bytes_sec = 0;
            for c in &mut t.chunks {
                c.active = false;
                c.speed_bytes_sec = 0;
            }
            let _ = self.storage.save_task(t);

            if let Some(a) = app {
                let _ = a.emit("download-progress", DownloadProgressPayload {
                    task_id: t.id.clone(),
                    downloaded_bytes: t.downloaded_bytes,
                    total_bytes: t.total_bytes,
                    speed_bytes_sec: 0,
                    eta_seconds: None,
                    status: t.status.clone(),
                    chunks: t.chunks.clone(),
                });
            }
        }

        Ok(())
    }

    pub async fn delete_task(&self, task_id: &str, delete_file: bool) -> Result<(), String> {
        let _ = self.pause_download(task_id, None).await;

        let task = {
            let mut lock = self.tasks.write().await;
            lock.remove(task_id)
        };

        let _ = self.storage.delete_task(task_id);

        if delete_file {
            if let Some(t) = task {
                let part_path = FileAssembler::get_part_path(&t.destination_path);
                let _ = tokio::fs::remove_file(&part_path).await;
                let _ = tokio::fs::remove_file(&t.destination_path).await;
            }
        }

        Ok(())
    }
}
