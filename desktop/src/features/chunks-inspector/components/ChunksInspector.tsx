import { For, Show, createMemo } from "solid-js";
import { DownloadTask, ChunkInfo } from "../../downloads/types";
import { formatBytes, formatSpeed } from "../../../shared/utils";
import { useSettings } from "../../../shared/stores/settingsStore";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Folder, ExternalLink, CheckCircle2, AlertCircle, Clock, FileText, X } from "lucide-solid";

interface ChunksInspectorProps {
  task: DownloadTask | null;
  fullWidth?: boolean;
  hideHeader?: boolean;
  onClose?: () => void;
}

export function ChunksInspector(props: ChunksInspectorProps) {
  const { t } = useSettings();

  const getChunkStatus = (chunk: ChunkInfo, taskStatus: DownloadTask["status"]): string => {
    if (chunk.is_completed) {
      return t("status_completed");
    }
    if (taskStatus === "Paused") {
      return t("status_paused");
    }
    if (chunk.active) {
      if (chunk.speed_bytes_sec > 0 || chunk.downloaded_bytes > 0) {
        return t("status_receiving");
      }
      return t("status_connecting");
    }
    return t("status_standby");
  };

  const sortedChunks = createMemo(() => {
    if (!props.task?.chunks) return [];
    return [...props.task.chunks].sort((a, b) => a.start_byte - b.start_byte);
  });

  const totalBytes = createMemo(() => props.task?.total_bytes || 0);

  const isLiveDownload = createMemo(() => {
    const s = props.task?.status;
    return s === "Downloading" || s === "Paused" || s === "Assembling";
  });

  const isCompleted = createMemo(() => props.task?.status === "Completed");

  return (
    <div
      class={
        props.fullWidth
          ? "w-full h-full bg-[var(--bg-secondary)] flex flex-col overflow-hidden text-[11px]"
          : "w-80 bg-[var(--bg-secondary)] flex flex-col overflow-hidden text-[11px] border-l border-[var(--border)]"
      }
    >
      {/* Header del Inspector */}
      <Show when={!props.hideHeader}>
        <div class="px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border)] font-bold text-[11px] flex justify-between items-center select-none shrink-0">
          <span class="tracking-wide uppercase">
            {isCompleted()
              ? "FILE DETAILS & LOCATION"
              : isLiveDownload()
              ? t("connections_progress_title")
              : "TASK INFORMATION"}
          </span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-[var(--accent)] font-mono">
              {isCompleted()
                ? "COMPLETED"
                : isLiveDownload() && props.task
                ? `${props.task.chunks?.length || 0} / ${props.task.connections_count} ${t("connections")}`
                : props.task ? String(props.task.status) : t("inactive")}
            </span>
            <Show when={props.onClose}>
              <button
                onClick={() => props.onClose?.()}
                class="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors"
                title={t("close")}
              >
                <X size={13} />
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <Show
        when={props.task}
        fallback={
          <div class="p-6 text-center text-[var(--text-muted)] space-y-2">
            <p>[{t("no_task_selected")}]</p>
            <p class="text-[10px]">{t("click_task_desc")}</p>
          </div>
        }
      >
        {(task) => (
          <Show
            when={isLiveDownload()}
            fallback={
              /* PANEL ALTERNATIVO: INFORMACIÓN DEL ARCHIVO (COMPLETADO O CANCELADO/EN COLA) */
              <div class="p-3 space-y-3 flex-1 overflow-y-auto">
                <Show
                  when={isCompleted()}
                  fallback={
                    /* ESTADO: CANCELADO / EN COLA / ERROR */
                    <div class="space-y-3 font-mono text-[11px]">
                      <div class="p-3 bg-[var(--bg-primary)] border border-[var(--border)] space-y-2">
                        <div class="flex items-center gap-2 text-[var(--text-muted)] font-bold">
                          <AlertCircle size={14} class="text-[var(--accent)]" />
                          <span class="uppercase">{t("task_inactive_title")}: {String(task().status)}</span>
                        </div>
                        <p class="text-[10px] text-[var(--text-muted)] font-sans">
                          {t("task_inactive_desc")}
                        </p>
                      </div>

                      <div class="p-3 bg-[var(--bg-primary)] border border-[var(--border)] space-y-1.5">
                        <div class="text-[10px] font-bold text-[var(--accent)] uppercase mb-1">{t("metadata_title")}</div>
                        <div>
                          <span class="text-[var(--text-muted)]">{t("file_label")}: </span>
                          <span class="font-bold text-[var(--text-main)] break-all">{task().filename}</span>
                        </div>
                        <div>
                          <span class="text-[var(--text-muted)]">{t("size_label")}: </span>
                          <span>{task().total_bytes ? formatBytes(task().total_bytes) : t("unknown")}</span>
                        </div>
                        <div>
                          <span class="text-[var(--text-muted)]">{t("dest_label")}: </span>
                          <span class="break-all text-[10px] text-[var(--text-muted)]">{task().destination_path}</span>
                        </div>
                      </div>
                    </div>
                  }
                >
                  {/* ESTADO: COMPLETADO (Descarga exitosa finalizada) */}
                  <div class="space-y-3 font-mono text-[11px]">
                    <div class="p-3 bg-[var(--bg-surface)] border border-[var(--accent)]/40 space-y-2">
                      <div class="flex items-center gap-2 text-[var(--accent)] font-bold">
                        <CheckCircle2 size={16} />
                        <span class="uppercase">{t("download_success_title")}</span>
                      </div>
                      <p class="text-[10px] text-[var(--text-muted)] font-sans">
                        {t("download_success_desc")}
                      </p>
                    </div>

                    <div class="p-3 bg-[var(--bg-primary)] border border-[var(--border)] space-y-2">
                      <div class="text-[10px] font-bold text-[var(--accent)] uppercase">{t("file_info_header")}</div>
                      <div>
                        <span class="text-[var(--text-muted)]">{t("file_name")}: </span>
                        <span class="font-bold text-[var(--text-main)] break-all">{task().filename}</span>
                      </div>
                      <div>
                        <span class="text-[var(--text-muted)]">{t("file_final_size")}: </span>
                        <span class="font-bold text-[var(--accent)]">{formatBytes(task().total_bytes || task().downloaded_bytes)}</span>
                      </div>
                      <div>
                        <span class="text-[var(--text-muted)]">{t("file_path")}: </span>
                        <span class="break-all text-[10px] text-[var(--text-muted)] select-all">{task().destination_path}</span>
                      </div>
                    </div>

                    <div class="flex flex-col gap-2 pt-1">
                      <button
                        onClick={async () => {
                          try {
                            await openPath(task().destination_path);
                          } catch (err) {
                            console.error("Error abriendo archivo:", err);
                          }
                        }}
                        class="w-full py-1.5 px-3 bg-[var(--accent)] text-[var(--bg-primary)] font-bold text-[11px] flex items-center justify-center gap-1.5 hover:opacity-90 active:translate-y-[1px] cursor-pointer uppercase transition-opacity"
                      >
                        <ExternalLink size={13} />
                        <span>{t("btn_open_file")}</span>
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            await revealItemInDir(task().destination_path);
                          } catch (err) {
                            console.error("Error abriendo carpeta:", err);
                          }
                        }}
                        class="w-full py-1.5 px-3 bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-main)] hover:border-[var(--accent)] font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer uppercase transition-colors"
                      >
                        <Folder size={13} />
                        <span>{t("btn_open_folder")}</span>
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            }
          >
            {/* PANEL ACTIVO: CONEXIONES Y SEGMENTOS DINÁMICOS (Downloading / Paused / Assembling) */}
            <div class="p-2 space-y-2.5 flex-1 overflow-y-auto">

            {/* SECCIÓN 1: BARRA DE PROGRESO MULTI-CONEXIÓN (IDM msctls_progress32 / Custom Multi-Segment Bar) */}
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider select-none">
                <span>{t("segments_map")}</span>
                <span class="font-mono text-[var(--text-main)]">
                  {formatBytes(task().downloaded_bytes)} / {task().total_bytes ? formatBytes(task().total_bytes) : t("unknown")}
                </span>
              </div>

              {/* Contenedor de la barra completa (0% a 100% del archivo) */}
              <div class="w-full h-6 bg-[var(--bg-primary)] border border-[var(--border)] relative overflow-hidden flex shadow-inner">
                <Show
                  when={totalBytes() > 0 && sortedChunks().length > 0}
                  fallback={
                    /* Fallback para streams sin Content-Length conocido o chunks uniformes */
                    <div class="w-full h-full flex">
                      <For each={task().chunks}>
                        {(chunk) => {
                          const chunkLen = Math.max(1, (chunk.end_byte - chunk.start_byte) + 1);
                          const pct = Math.min(100, Math.round((chunk.downloaded_bytes / chunkLen) * 100));
                          return (
                            <div
                              class="flex-1 h-full border-r border-[var(--border)] last:border-r-0 relative bg-[var(--bg-primary)]"
                              title={`#${chunk.id + 1}: ${pct}%`}
                            >
                              <div
                                class="h-full bg-[var(--accent)] transition-all duration-200"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  }
                >
                  <For each={sortedChunks()}>
                    {(chunk) => {
                      const total = totalBytes();
                      const leftPercent = Math.min(100, (chunk.start_byte / total) * 100);
                      const chunkSpan = Math.max(0, (chunk.end_byte - chunk.start_byte) + 1);
                      const widthPercent = Math.min(100 - leftPercent, (chunkSpan / total) * 100);

                      const chunkProgressRatio = Math.min(1, Math.max(0, chunk.downloaded_bytes / chunkSpan));
                      const fillPercent = chunk.is_completed ? 100 : chunkProgressRatio * 100;

                      return (
                        <div
                          class="absolute top-0 bottom-0 border-r border-black/40 overflow-hidden bg-[var(--bg-surface)]/60"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(0.4, widthPercent)}%`,
                          }}
                          title={`Socket #${chunk.id + 1} | Offset: ${chunk.start_byte.toLocaleString()} - ${chunk.end_byte.toLocaleString()} | ${formatBytes(chunk.downloaded_bytes)} (${Math.round(fillPercent)}%)`}
                        >
                          <div
                            class="h-full bg-[var(--accent)] transition-all duration-150 relative"
                            style={{ width: `${fillPercent}%` }}
                          >
                            <Show when={chunk.active && !chunk.is_completed}>
                              <div class="absolute inset-0 opacity-25 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.8)_25%,rgba(0,0,0,0.8)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.8)_75%)] bg-[length:8px_8px] animate-pulse"></div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>

              {/* Leyenda de estado de la barra */}
              <div class="flex items-center justify-between text-[9px] text-[var(--text-muted)] font-mono pt-0.5">
                <div class="flex items-center gap-3">
                  <span class="flex items-center gap-1">
                    <span class="inline-block w-2 h-2 bg-[var(--accent)]"></span>
                    <span>{t("downloaded_label")}</span>
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="inline-block w-2 h-2 bg-[var(--bg-surface)] border border-[var(--border)]"></span>
                    <span>{t("status_standby")}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: LISTA DE CONEXIONES */}
            <div class="space-y-1">
              <div class="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider select-none">
                <span>{t("active_threads")}</span>
                <span class="font-mono text-[var(--accent)]">
                  {task().chunks ? `${task().chunks.filter((c) => c.active).length} ${t("status_receiving").toLowerCase()}` : ""}
                </span>
              </div>

              {/* Lista limpia sin bordes pesados ni aspecto de tabla tradicional */}
              <div class="max-h-52 overflow-y-auto space-y-1 pr-0.5">
                <For
                  each={sortedChunks()}
                  fallback={
                    <div class="py-4 text-center text-[var(--text-muted)] text-[10px] italic">
                      [{t("inactive")}]
                    </div>
                  }
                >
                  {(chunk) => {
                    const status = getChunkStatus(chunk, task().status);
                    return (
                      <div class="flex items-center justify-between px-2.5 py-1.5 rounded-sm hover:bg-[var(--bg-surface)]/60 transition-colors text-[10px] font-mono">
                        {/* Identificador y Estado */}
                        <div class="flex items-center gap-2.5 min-w-0">
                          <span class="font-bold text-[var(--accent)] w-5 shrink-0">
                            #{chunk.id + 1}
                          </span>
                          <span
                            class={`flex items-center gap-1.5 truncate ${
                              chunk.is_completed
                                ? "text-[var(--text-muted)]"
                                : chunk.active
                                ? "text-[var(--text-main)] font-semibold"
                                : "text-[var(--text-muted)]"
                            }`}
                          >
                            <Show when={chunk.active && !chunk.is_completed}>
                              <span class="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping shrink-0" />
                            </Show>
                            {status}
                          </span>
                        </div>

                        {/* Descargado y Velocidad */}
                        <div class="flex items-center gap-4 shrink-0 text-right">
                          <span class="font-mono text-[var(--text-main)]">
                            {formatBytes(chunk.downloaded_bytes)}
                          </span>
                          <span class="w-16 text-right font-bold text-[var(--accent)]">
                            {chunk.speed_bytes_sec > 0 ? formatSpeed(chunk.speed_bytes_sec) : "--"}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Metadatos Técnicos de la Conexión */}
            <div class="grid grid-cols-2 gap-2 p-2 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono">
              <div class="truncate">
                <span class="text-[var(--text-muted)] uppercase">{t("http_ranges")}: </span>
                <span class={task().supports_ranges ? "text-[var(--accent)] font-bold" : "text-red-400 font-bold"}>
                  {task().supports_ranges ? t("available") : t("not_supported")}
                </span>
              </div>
              <div class="truncate text-right">
                <span class="text-[var(--text-muted)] uppercase">{t("sockets")}: </span>
                <span class="text-[var(--text-main)] font-bold">{task().connections_count} MAX</span>
              </div>
            </div>

          </div>
          </Show>
        )}
      </Show>
    </div>
  );
}
