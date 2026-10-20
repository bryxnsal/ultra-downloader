use std::path::{Path, PathBuf};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt, SeekFrom};

pub struct FileAssembler;

impl FileAssembler {
    pub fn get_part_path(dest_path: &str) -> PathBuf {
        PathBuf::from(format!("{}.udmpart", dest_path))
    }

    pub async fn preallocate(dest_path: &str, total_bytes: u64) -> Result<(), String> {
        let part_path = Self::get_part_path(dest_path);

        if let Some(parent) = part_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directories for {}: {}", dest_path, e))?;
        }

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(&part_path)
            .await
            .map_err(|e| format!("Failed to open/create file {}: {}", part_path.display(), e))?;

        if total_bytes > 0 {
            file.set_len(total_bytes)
                .await
                .map_err(|e| format!("Failed to preallocate {} bytes: {}", total_bytes, e))?;
        }

        Ok(())
    }

    pub async fn open_for_chunk_write(dest_path: &str) -> Result<File, String> {
        let part_path = Self::get_part_path(dest_path);
        OpenOptions::new()
            .write(true)
            .open(&part_path)
            .await
            .map_err(|e| format!("Failed to open chunk write handle for {}: {}", part_path.display(), e))
    }

    pub async fn write_at(file: &mut File, offset: u64, data: &[u8]) -> Result<(), String> {
        file.seek(SeekFrom::Start(offset))
            .await
            .map_err(|e| format!("Seek failed at offset {}: {}", offset, e))?;
        file.write_all(data)
            .await
            .map_err(|e| format!("Write failed at offset {}: {}", offset, e))?;
        Ok(())
    }

    pub async fn finalize(dest_path: &str) -> Result<(), String> {
        let part_path = Self::get_part_path(dest_path);
        let final_path = Path::new(dest_path);

        if final_path.exists() {
            let _ = tokio::fs::remove_file(final_path).await;
        }

        let mut last_err = None;
        for attempt in 0..8 {
            match tokio::fs::rename(&part_path, final_path).await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    last_err = Some(e);
                    tokio::time::sleep(std::time::Duration::from_millis(100 * (1 << attempt.min(3)))).await;
                }
            }
        }

        Err(format!(
            "Failed to rename {} to {}: {:?}",
            part_path.display(),
            final_path.display(),
            last_err
        ))
    }

    pub async fn mux_video_audio(
        video_part: &Path,
        audio_part: &Path,
        output_path: &Path,
        custom_ffmpeg_path: Option<&str>,
    ) -> Result<(), String> {
        let ffmpeg_cmd = custom_ffmpeg_path
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("ffmpeg");

        if output_path.exists() {
            let _ = tokio::fs::remove_file(output_path).await;
        }

        let mut cmd = tokio::process::Command::new(ffmpeg_cmd);
        cmd.arg("-y")
            .arg("-i")
            .arg(video_part)
            .arg("-i")
            .arg(audio_part)
            .arg("-c")
            .arg("copy")
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("1:a:0")
            .arg(output_path);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: prevents ffmpeg console popup on Windows

        let status = cmd
            .status()
            .await
            .map_err(|e| format!("Failed to spawn ffmpeg muxer ('{}'). Make sure FFmpeg is installed and accessible in your system PATH or configured in Settings > Advanced: {}", ffmpeg_cmd, e))?;

        if !status.success() {
            return Err(format!("FFmpeg muxing exited with code: {:?}", status.code()));
        }

        let _ = tokio::fs::remove_file(video_part).await;
        let _ = tokio::fs::remove_file(audio_part).await;

        Ok(())
    }
}
