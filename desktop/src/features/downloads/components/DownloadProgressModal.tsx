import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { DownloadTask } from "../types";
import { formatBytes, formatSpeed } from "../../../shared/utils";
import { useSettings } from "../../../shared/stores/settingsStore";
import { ChunksInspector } from "../../chunks-inspector/components/ChunksInspector";
import { WindowControls } from "../../../shared/components/WindowControls";
import { X, Pause, Play, ChevronDown, ChevronUp, Activity, Sliders, CheckCircle2 } from "lucide-solid";

interface DownloadProgressModalProps {
  task: DownloadTask | null;
  isOpen: boolean;
  isStandaloneWindow?: boolean;
  onClose: () => void;
  onPauseResume: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

export function DownloadProgressModal(props: DownloadProgressModalProps) {
  const { settings, t } = useSettings();

  const [activeTab, setActiveTab] = createSignal<"status" | "options" | "limiter">("status");
  const [showDetails, setShowDetails] = createSignal(true);
  const [speedLimitEnabled, setSpeedLimitEnabled] = createSignal(false);
  const [speedLimitKb, setSpeedLimitKb] = createSignal(2048);

  const percent = () => {
    if (!props.task || props.task.total_bytes === 0) return 0;
    return Math.min(100, Math.round((props.task.downloaded_bytes / props.task.total_bytes) * 100));
  };

  const timeLeftFormatted = () => {
    if (!props.task || props.task.speed_bytes_sec === 0 || props.task.total_bytes === 0) return t("unknown");
    const remaining = props.task.total_bytes - props.task.downloaded_bytes;
    const secs = Math.ceil(remaining / props.task.speed_bytes_sec);
    if (secs < 60) return `${secs} sec`;
    const mins = Math.floor(secs / 60);
    return `${mins} min ${secs % 60} sec`;
  };

  const content = (
    <div
      class={
        props.isStandaloneWindow
          ? "w-full h-full bg-[var(--bg-secondary)] flex flex-col justify-between text-[12px] select-none overflow-hidden"
          : "w-full max-w-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl rounded-none flex flex-col text-[12px] max-h-[92vh] overflow-hidden"
      }
    >
      {/* Header Frameless Arrastrable con Controles Custom */}
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2 truncate">
          <span class="inline-block w-2 h-2 bg-white shrink-0"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] truncate" title={props.task?.filename}>
            {props.task?.filename || t("download_progress_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={false} />
      </div>

      {/* Barra de Pestañas (Download status | Options on completion | Speed Limiter) */}
      <div class="flex border-b border-[var(--border)] bg-[var(--bg-primary)] px-2 pt-1.5 select-none gap-1 shrink-0">
            <button
              onClick={() => setActiveTab("status")}
              class={`px-3 py-1.5 font-bold tracking-wider uppercase text-[11px] cursor-pointer border-t-2 transition-colors ${
                activeTab() === "status"
                  ? "border-[var(--accent)] text-[var(--text-main)] bg-[var(--bg-secondary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {t("tab_download_status")}
            </button>
            <button
              onClick={() => setActiveTab("options")}
              class={`px-3 py-1.5 font-bold tracking-wider uppercase text-[11px] cursor-pointer border-t-2 transition-colors ${
                activeTab() === "options"
                  ? "border-[var(--accent)] text-[var(--text-main)] bg-[var(--bg-secondary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {t("tab_options_completion")}
            </button>
            <button
              onClick={() => setActiveTab("limiter")}
              class={`px-3 py-1.5 font-bold tracking-wider uppercase text-[11px] cursor-pointer border-t-2 transition-colors ${
                activeTab() === "limiter"
                  ? "border-[var(--accent)] text-[var(--text-main)] bg-[var(--bg-secondary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {t("tab_speed_limiter")}
            </button>
          </div>

          {/* Cuerpo de Pestañas */}
          <div class="p-3 bg-[var(--bg-secondary)] overflow-y-auto">
            {/* PESTAÑA 1: DOWNLOAD STATUS (Dialog 363) */}
            <Show when={activeTab() === "status"}>
              <div class="space-y-1.5 font-mono text-[11px]">
                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("file_url")}:
                  </span>
                  <span class="col-span-3 text-[var(--text-main)] truncate select-all">
                    {props.task?.url}
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("status_label")}:
                  </span>
                  <span class="col-span-3 text-[var(--accent)] font-bold uppercase flex items-center gap-1.5">
                    {props.task?.status === "Assembling" ? (
                      <>
                        <span class="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-ping"></span>
                        <span>Assembling (Muxing Audio + Video)...</span>
                      </>
                    ) : typeof props.task?.status === "object" && props.task?.status !== null && "Error" in props.task?.status ? (
                      <span class="text-red-400">Error: {(props.task.status as any).Error}</span>
                    ) : (
                      String(props.task?.status || "")
                    )}
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("file_size_label")}:
                  </span>
                  <span class="col-span-3 text-[var(--text-main)]">
                    {props.task?.total_bytes ? `${formatBytes(props.task.total_bytes)} (${props.task.total_bytes.toLocaleString()} bytes)` : t("unknown")}
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("downloaded_label")}:
                  </span>
                  <span class="col-span-3 text-[var(--text-main)] font-bold">
                    {formatBytes(props.task?.downloaded_bytes || 0)} ({percent()}%)
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("transfer_rate_label")}:
                  </span>
                  <span class="col-span-3 text-[var(--accent)] font-bold">
                    {formatSpeed(props.task?.speed_bytes_sec || 0)}
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5 border-b border-[var(--border)]/40">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("time_left_label")}:
                  </span>
                  <span class="col-span-3 text-[var(--text-main)]">
                    {timeLeftFormatted()}
                  </span>
                </div>

                <div class="grid grid-cols-5 gap-2 py-0.5">
                  <span class="col-span-2 text-[var(--text-muted)] uppercase tracking-wide">
                    {t("resume_capability")}:
                  </span>
                  <span class={`col-span-3 font-bold ${props.task?.supports_ranges ? "text-[var(--accent)]" : "text-red-400"}`}>
                    {props.task?.supports_ranges ? t("yes") : t("no")}
                  </span>
                </div>
              </div>
            </Show>

            {/* PESTAÑA 2: OPTIONS ON COMPLETION */}
            <Show when={activeTab() === "options"}>
              <div class="space-y-3 p-2 text-[11px]">
                <label class="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                  <input type="checkbox" checked class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer" />
                  <span>{t("opt_show_complete_dialog")}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                  <input type="checkbox" class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer" />
                  <span>{t("opt_play_sound")}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                  <input type="checkbox" class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer" />
                  <span>{t("opt_auto_close_window")}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-[var(--text-muted)]">
                  <input type="checkbox" class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer" />
                  <span>{t("opt_hang_up_modem")}</span>
                </label>
              </div>
            </Show>

            {/* PESTAÑA 3: SPEED LIMITER */}
            <Show when={activeTab() === "limiter"}>
              <div class="space-y-3 p-2 text-[11px]">
                <label class="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={speedLimitEnabled()}
                    onChange={(e) => {
                      const enabled = e.currentTarget.checked;
                      setSpeedLimitEnabled(enabled);
                      import("@tauri-apps/api/core").then(({ invoke }) => {
                        invoke("set_speed_limiter", { enabled, speedKbSec: speedLimitKb() }).catch(() => {});
                      }).catch(() => {});
                    }}
                    class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer"
                  />
                  <span class="font-bold uppercase tracking-wider">{t("limiter_enable")}</span>
                </label>

                <div class="flex items-center gap-2 pl-5">
                  <span class="text-[var(--text-muted)]">{t("limiter_max_speed")}:</span>
                  <input
                    type="number"
                    value={speedLimitKb()}
                    onInput={(e) => {
                      const val = parseInt(e.currentTarget.value) || 0;
                      setSpeedLimitKb(val);
                      if (speedLimitEnabled()) {
                        import("@tauri-apps/api/core").then(({ invoke }) => {
                          invoke("set_speed_limiter", { enabled: true, speedKbSec: val }).catch(() => {});
                        }).catch(() => {});
                      }
                    }}
                    disabled={!speedLimitEnabled()}
                    class="w-28 border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-main)] font-mono text-[11px] focus:outline-none focus:border-[var(--accent)] disabled:opacity-40"
                  />
                  <span class="text-[var(--text-muted)]">KB/s</span>
                </div>
              </div>
            </Show>
          </div>

          {/* Barra de Progreso Principal (msctls_progress32 ID 1146) */}
          <div class="px-3 pt-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
            <div class="w-full h-5 bg-[var(--bg-primary)] border border-[var(--border)] relative overflow-hidden">
              <div
                class="h-full bg-[var(--accent)] transition-all duration-300 relative"
                style={{ width: `${percent()}%` }}
              >
                {/* Rayas industriales sutiles */}
                <div class="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.6)_25%,rgba(0,0,0,0.6)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.6)_75%)] bg-[length:12px_12px]"></div>
              </div>
              <div class="absolute inset-0 flex items-center justify-center font-mono font-bold text-[10px] text-white mix-blend-difference select-none">
                {percent()}%
              </div>
            </div>
          </div>

          {/* Botones de Control IDM (Hide Details | Pause | Cancel) */}
          <div class="px-3 py-2 bg-[var(--bg-secondary)] flex items-center justify-between border-b border-[var(--border)]">
            <button
              onClick={() => setShowDetails(!showDetails())}
              class="border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] cursor-pointer uppercase flex items-center gap-1 transition-colors"
            >
              {showDetails() ? (
                <>
                  <ChevronUp size={12} />
                  <span>{t("hide_details")}</span>
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  <span>{t("show_details")}</span>
                </>
              )}
            </button>

            <div class="flex items-center gap-2">
              <button
                disabled={props.task?.status === "Assembling"}
                onClick={() => props.task && props.task.status !== "Assembling" && props.onPauseResume(props.task.id)}
                class={`border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-1 text-[11px] font-bold uppercase flex items-center gap-1.5 transition-colors ${
                  props.task?.status === "Assembling"
                    ? "opacity-50 cursor-not-allowed text-[var(--text-muted)]"
                    : "text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                }`}
              >
                {props.task?.status === "Assembling" ? (
                  <>
                    <span class="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                    <span>MUXING...</span>
                  </>
                ) : props.task?.status === "Downloading" ? (
                  <>
                    <Pause size={12} />
                    <span>{t("pause")}</span>
                  </>
                ) : (
                  <>
                    <Play size={12} />
                    <span>{t("resume")}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => props.task && props.onCancel(props.task.id)}
                class="border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-bold text-red-400 hover:border-red-500 hover:text-red-300 cursor-pointer uppercase transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          </div>

          {/* Subpanel de Conexiones y Segmentos Dinámicos (SysListView32 ID 1177) */}
          <Show when={showDetails()}>
            <div class="flex-1 w-full bg-[var(--bg-primary)] overflow-y-auto border-t border-[var(--border)]">
              <ChunksInspector task={props.task} fullWidth={true} hideHeader={true} />
            </div>
          </Show>
        </div>
      );

  return (
    <Show when={props.isOpen && (props.isStandaloneWindow || props.task)}>
      {props.isStandaloneWindow ? (
        props.task ? (
          content
        ) : (
          <div class="w-full h-full bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] text-[var(--accent)] gap-2">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-ping" />
            <span>CONNECTING SOCKETS...</span>
          </div>
        )
      ) : (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          {content}
        </div>
      )}
    </Show>
  );
}
