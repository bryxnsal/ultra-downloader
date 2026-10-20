use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::{ChunkInfo, DownloadStatus, DownloadTask};

pub struct StateStorage {
    conn: Mutex<Connection>,
}

impl StateStorage {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database at {:?}: {}", db_path, e))?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| format!("Failed to configure SQLite pragmas: {}", e))?;

        let storage = Self {
            conn: Mutex::new(conn),
        };
        storage.migrate()?;

        Ok(storage)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                audio_url TEXT,
                filename TEXT NOT NULL,
                destination_path TEXT NOT NULL,
                total_bytes INTEGER NOT NULL DEFAULT 0,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                supports_ranges INTEGER NOT NULL DEFAULT 1,
                connections_count INTEGER NOT NULL DEFAULT 8,
                error_message TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS download_chunks (
                task_id TEXT NOT NULL,
                id INTEGER NOT NULL,
                start_byte INTEGER NOT NULL,
                current_byte INTEGER NOT NULL,
                end_byte INTEGER NOT NULL,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                is_completed INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (task_id, id),
                FOREIGN KEY (task_id) REFERENCES downloads(id) ON DELETE CASCADE
            );",
        )
        .map_err(|e| format!("Failed to run database migrations: {}", e))?;

        let _ = conn.execute("ALTER TABLE downloads ADD COLUMN audio_url TEXT", []);

        conn.execute(
            "UPDATE downloads SET status = 'Paused' WHERE status = 'Downloading' OR status = 'Assembling'",
            [],
        )
        .map_err(|e| format!("Failed to recover tasks on startup: {}", e))?;

        Ok(())
    }

    pub fn load_all_tasks(&self) -> Result<Vec<DownloadTask>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, url, audio_url, filename, destination_path, total_bytes, downloaded_bytes,
                        status, supports_ranges, connections_count, error_message, created_at
                 FROM downloads ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let task_rows = stmt
            .query_map([], |row| {
                let status_str: String = row.get(7)?;
                let error_msg: Option<String> = row.get(10)?;

                let status = match status_str.as_str() {
                    "Queued" => DownloadStatus::Queued,
                    "Downloading" => DownloadStatus::Downloading,
                    "Paused" => DownloadStatus::Paused,
                    "Assembling" => DownloadStatus::Assembling,
                    "Completed" => DownloadStatus::Completed,
                    "Error" => DownloadStatus::Error(error_msg.unwrap_or_else(|| "Unknown error".into())),
                    _ => DownloadStatus::Paused,
                };

                let supports_ranges: i64 = row.get(8)?;

                Ok(DownloadTask {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    audio_url: row.get(2)?,
                    filename: row.get(3)?,
                    destination_path: row.get(4)?,
                    total_bytes: row.get::<_, i64>(5)? as u64,
                    downloaded_bytes: row.get::<_, i64>(6)? as u64,
                    speed_bytes_sec: 0,
                    status,
                    supports_ranges: supports_ranges != 0,
                    connections_count: row.get::<_, i64>(9)? as usize,
                    chunks: Vec::new(),
                    created_at: row.get::<_, i64>(11)? as u64,
                    eta_seconds: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut tasks = Vec::new();
        for task_res in task_rows {
            let mut task = task_res.map_err(|e| e.to_string())?;

            let mut chunk_stmt = conn
                .prepare(
                    "SELECT id, start_byte, current_byte, end_byte, downloaded_bytes, is_completed
                     FROM download_chunks WHERE task_id = ? ORDER BY id ASC",
                )
                .map_err(|e| e.to_string())?;

            let chunk_rows = chunk_stmt
                .query_map([&task.id], |crow| {
                    let is_completed_int: i64 = crow.get(5)?;
                    Ok(ChunkInfo {
                        id: crow.get::<_, i64>(0)? as usize,
                        start_byte: crow.get::<_, i64>(1)? as u64,
                        current_byte: crow.get::<_, i64>(2)? as u64,
                        end_byte: crow.get::<_, i64>(3)? as u64,
                        downloaded_bytes: crow.get::<_, i64>(4)? as u64,
                        speed_bytes_sec: 0,
                        active: false,
                        is_completed: is_completed_int != 0,
                    })
                })
                .map_err(|e| e.to_string())?;

            for chunk_res in chunk_rows {
                task.chunks.push(chunk_res.map_err(|e| e.to_string())?);
            }

            tasks.push(task);
        }

        Ok(tasks)
    }

    pub fn save_task(&self, task: &DownloadTask) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let (status_str, error_msg) = match &task.status {
            DownloadStatus::Queued => ("Queued", None),
            DownloadStatus::Downloading => ("Downloading", None),
            DownloadStatus::Paused => ("Paused", None),
            DownloadStatus::Assembling => ("Assembling", None),
            DownloadStatus::Completed => ("Completed", None),
            DownloadStatus::Error(msg) => ("Error", Some(msg.clone())),
        };

        tx.execute(
            "INSERT INTO downloads (id, url, audio_url, filename, destination_path, total_bytes, downloaded_bytes,
                                    status, supports_ranges, connections_count, error_message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                downloaded_bytes = excluded.downloaded_bytes,
                status = excluded.status,
                error_message = excluded.error_message",
            params![
                task.id,
                task.url,
                task.audio_url,
                task.filename,
                task.destination_path,
                task.total_bytes as i64,
                task.downloaded_bytes as i64,
                status_str,
                if task.supports_ranges { 1 } else { 0 },
                task.connections_count as i64,
                error_msg,
                task.created_at as i64,
            ],
        )
        .map_err(|e| format!("Failed to insert/update download task {}: {}", task.id, e))?;

        for chunk in &task.chunks {
            tx.execute(
                "INSERT INTO download_chunks (task_id, id, start_byte, current_byte, end_byte, downloaded_bytes, is_completed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(task_id, id) DO UPDATE SET
                    current_byte = excluded.current_byte,
                    end_byte = excluded.end_byte,
                    downloaded_bytes = excluded.downloaded_bytes,
                    is_completed = excluded.is_completed",
                params![
                    task.id,
                    chunk.id as i64,
                    chunk.start_byte as i64,
                    chunk.current_byte as i64,
                    chunk.end_byte as i64,
                    chunk.downloaded_bytes as i64,
                    if chunk.is_completed { 1 } else { 0 },
                ],
            )
            .map_err(|e| format!("Failed to insert/update chunk #{} for task {}: {}", chunk.id, task.id, e))?;
        }

        tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
        Ok(())
    }

    pub fn delete_task(&self, task_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM downloads WHERE id = ?", [task_id])
            .map_err(|e| format!("Failed to delete task {}: {}", task_id, e))?;
        Ok(())
    }
}
