export interface ChunkInfo {
  id: number;
  start_byte: number;
  current_byte: number;
  end_byte: number;
  downloaded_bytes: number;
  speed_bytes_sec: number;
  active: boolean;
  is_completed: boolean;
}

export type DownloadStatusType = "Queued" | "Downloading" | "Paused" | "Assembling" | "Completed" | { Error: string };

export interface DownloadTask {
  id: string;
  url: string;
  audio_url?: string | null;
  filename: string;
  destination_path: string;
  total_bytes: number;
  downloaded_bytes: number;
  speed_bytes_sec: number;
  status: DownloadStatusType;
  supports_ranges: boolean;
  connections_count: number;
  chunks: ChunkInfo[];
  created_at: number;
  eta_seconds?: number | null;
}

export interface UrlMetadata {
  url: string;
  audio_url?: string | null;
  suggested_filename: string;
  content_length: number | null;
  accepts_ranges: boolean;
  content_type: string | null;
}

export interface DownloadProgressPayload {
  task_id: string;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bytes_sec: number;
  eta_seconds: number | null;
  status: DownloadStatusType;
  chunks: ChunkInfo[];
}
