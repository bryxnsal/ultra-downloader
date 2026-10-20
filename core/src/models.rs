use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Assembling,
    Completed,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkInfo {
    pub id: usize,
    pub start_byte: u64,
    pub current_byte: u64,
    pub end_byte: u64,
    pub downloaded_bytes: u64,
    pub speed_bytes_sec: u64,
    pub active: bool,
    pub is_completed: bool,
}

impl ChunkInfo {
    pub fn remaining_bytes(&self) -> u64 {
        if self.is_completed || self.current_byte >= self.end_byte {
            0
        } else {
            self.end_byte.saturating_sub(self.current_byte) + 1
        }
    }

    pub fn try_split(&mut self, new_chunk_id: usize) -> Option<ChunkInfo> {
        const MIN_SPLIT_THRESHOLD: u64 = 2 * 1024 * 1024;

        let remaining = self.remaining_bytes();
        if remaining < MIN_SPLIT_THRESHOLD {
            return None;
        }

        let mid = self.current_byte + (remaining / 2);
        let new_chunk = ChunkInfo {
            id: new_chunk_id,
            start_byte: mid + 1,
            current_byte: mid + 1,
            end_byte: self.end_byte,
            downloaded_bytes: 0,
            speed_bytes_sec: 0,
            active: true,
            is_completed: false,
        };

        self.end_byte = mid;

        Some(new_chunk)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub audio_url: Option<String>,
    pub filename: String,
    pub destination_path: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub speed_bytes_sec: u64,
    pub status: DownloadStatus,
    pub supports_ranges: bool,
    pub connections_count: usize,
    pub chunks: Vec<ChunkInfo>,
    pub created_at: u64,
    pub eta_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlMetadata {
    pub url: String,
    #[serde(default)]
    pub audio_url: Option<String>,
    pub suggested_filename: String,
    pub content_length: Option<u64>,
    pub accepts_ranges: bool,
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub task_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_sec: u64,
    pub eta_seconds: Option<u64>,
    pub status: DownloadStatus,
    pub chunks: Vec<ChunkInfo>,
}
