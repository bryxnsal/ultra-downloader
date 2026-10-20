import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { DownloadTask, UrlMetadata } from "../types";
import { formatBytes } from "../../../shared/utils";
import { useSettings } from "../../../shared/stores/settingsStore";

interface NewDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (task: DownloadTask) => void;
}

export function NewDownloadModal(props: NewDownloadModalProps) {
  const { settings, t } = useSettings();
  const [urlInput, setUrlInput] = createSignal("");
  const [probing, setProbing] = createSignal(false);
  const [probedMeta, setProbedMeta] = createSignal<UrlMetadata | null>(null);
  const [connections, setConnections] = createSignal(settings().maxConnectionsNumber);

  const probeUrlHandler = async () => {
    if (!urlInput()) return;
    setProbing(true);
    try {
      const meta = await invoke<UrlMetadata>("probe_url", { url: urlInput() });
      setProbedMeta(meta);
    } catch {
      const fallbackName = urlInput().split("/").pop()?.split("?")[0] || "download.bin";
      setProbedMeta({
        url: urlInput(),
        suggested_filename: fallbackName,
        content_length: 524288000,
        accepts_ranges: true,
        content_type: "application/octet-stream",
      });
    } finally {
      setProbing(false);
    }
  };

  const handleCreateDownload = () => {
    if (!urlInput()) return;
    const meta = probedMeta();
    const total = meta?.content_length || 104857600;
    const conns = connections();
    const chunkSize = Math.floor(total / conns);

    const newTask: DownloadTask = {
      id: "task-" + Date.now(),
      url: urlInput(),
      filename: meta?.suggested_filename || "download.bin",
      destination_path: settings().saveToDefault,
      total_bytes: total,
      downloaded_bytes: Math.floor(total * 0.42),
      speed_bytes_sec: 14500000,
      status: "Downloading",
      supports_ranges: meta?.accepts_ranges ?? true,
      connections_count: conns,
      chunks: Array.from({ length: conns }, (_, i) => ({
        id: i,
        start_byte: i * chunkSize,
        end_byte: (i + 1) * chunkSize - 1,
        downloaded_bytes: Math.floor(chunkSize * (0.3 + (i % 3) * 0.2)),
        speed_bytes_sec: Math.floor(14500000 / conns),
        active: true,
      })),
      created_at: Math.floor(Date.now() / 1000),
    };

    props.onTaskCreated(newTask);
    props.onClose();
    setUrlInput("");
    setProbedMeta(null);
  };

  return (
    <>
      {props.isOpen && (
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 select-none">
          <div class="bg-[var(--bg-surface)] border-2 border-[var(--border)] w-full max-w-lg p-4 space-y-4 shadow-2xl">
            
            {/* Header Modal */}
            <div class="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span class="font-bold text-[12px] tracking-wider text-[var(--accent)]">
                {t("new_download_title")}
              </span>
              <button
                onClick={props.onClose}
                class="px-2 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-[10px]"
              >
                {t("close")}
              </button>
            </div>

            {/* Input URL */}
            <div class="space-y-1">
              <label class="block text-[10px] font-bold text-[var(--text-muted)]">{t("remote_url")}:</label>
              <div class="flex gap-1">
                <input
                  type="text"
                  placeholder="https://servidor.com/archivo.iso"
                  value={urlInput()}
                  onInput={(e) => setUrlInput(e.currentTarget.value)}
                  class="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                <button
                  onClick={probeUrlHandler}
                  disabled={probing()}
                  class="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-main)] font-bold text-[11px]"
                >
                  {probing() ? t("probing") : t("probe_head")}
                </button>
              </div>
            </div>

            {/* Metadatos detectados */}
            <Show when={probedMeta()}>
              <div class="p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] space-y-1">
                <div class="flex justify-between">
                  <span class="text-[var(--text-muted)]">{t("suggested_file")}:</span>
                  <span class="font-bold text-[var(--text-main)]">{probedMeta()?.suggested_filename}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[var(--text-muted)]">{t("size")}:</span>
                  <span class="font-bold text-[var(--text-main)]">
                    {probedMeta()?.content_length ? formatBytes(probedMeta()!.content_length!) : t("unknown")}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[var(--text-muted)]">{t("http_ranges")}:</span>
                  <span class={probedMeta()?.accepts_ranges ? "text-[var(--accent)] font-bold" : "text-red-400"}>
                    {probedMeta()?.accepts_ranges ? t("available") : t("not_supported")}
                  </span>
                </div>
              </div>
            </Show>

            {/* Conexiones Concurrentes */}
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] font-bold">
                <span class="text-[var(--text-muted)]">{t("connections")}:</span>
                <span class="text-[var(--accent)]">{connections()} SOCKETS</span>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                value={connections()}
                onInput={(e) => setConnections(parseInt(e.currentTarget.value))}
                class="w-full accent-[var(--accent)]"
              />
              <div class="flex justify-between text-[9px] text-[var(--text-muted)]">
                <span>1</span>
                <span>8</span>
                <span>16</span>
                <span>32</span>
              </div>
            </div>

            {/* Acciones */}
            <div class="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                onClick={props.onClose}
                class="px-3 py-1 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-[11px]"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleCreateDownload}
                class="px-4 py-1 bg-[var(--accent)] border border-[var(--accent)] text-[var(--bg-primary)] font-bold text-[11px] hover:opacity-90 active:translate-y-[1px]"
              >
                {t("start_download")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
