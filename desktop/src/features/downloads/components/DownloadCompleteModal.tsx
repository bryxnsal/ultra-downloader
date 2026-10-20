import { createSignal, Show } from "solid-js";
import { DownloadTask } from "../types";
import { formatBytes } from "../../../shared/utils";
import { useSettings } from "../../../shared/stores/settingsStore";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { WindowControls } from "../../../shared/components/WindowControls";
import { X, CheckCircle2, Folder, ExternalLink, PlaySquare } from "lucide-solid";

interface DownloadCompleteModalProps {
  task: DownloadTask | null;
  isOpen: boolean;
  isStandaloneWindow?: boolean;
  onClose: () => void;
}

export function DownloadCompleteModal(props: DownloadCompleteModalProps) {
  const { settings, t } = useSettings();
  const [dontShowAgain, setDontShowAgain] = createSignal(false);
  const [errorStatus, setErrorStatus] = createSignal<string | null>(null);

  const handleOpenFile = async () => {
    if (!props.task?.destination_path) return;
    try {
      await openPath(props.task.destination_path);
    } catch (err) {
      console.error("Error abriendo archivo:", err);
      setErrorStatus(String(err));
    }
  };

  const handleOpenFolder = async () => {
    if (!props.task?.destination_path) return;
    try {
      await revealItemInDir(props.task.destination_path);
    } catch (err) {
      console.error("Error abriendo carpeta:", err);
      setErrorStatus(String(err));
    }
  };

  const content = (
    <div
      class={
        props.isStandaloneWindow
          ? "w-full h-full bg-[var(--bg-secondary)] flex flex-col justify-between text-[12px] select-none"
          : "w-full max-w-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl rounded-none flex flex-col text-[12px]"
      }
    >
      {/* Header Frameless Arrastrable con Controles Custom */}
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2 truncate">
          <span class="inline-block w-2 h-2 bg-white shrink-0"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] uppercase truncate">
            {t("download_complete_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={true} />
      </div>

      {/* Cuerpo Informativo */}
      <div class="p-4 space-y-3.5 flex-1 overflow-y-auto">
            {/* Resumen Icono + Texto (Static ID 1301) */}
            <div class="flex items-start gap-3 bg-[var(--bg-surface)] border border-[var(--border)] p-3">
              <div class="p-2 border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div class="space-y-1 font-mono text-[11px] truncate">
                <div class="font-bold text-[var(--text-main)] text-[12px] truncate">
                  {props.task?.filename}
                </div>
                <div class="text-[var(--text-muted)]">
                  {formatBytes(props.task?.total_bytes || 0)} transferidos correctamente.
                </div>
              </div>
            </div>

            {/* Address / URL (Static ID 1610 y Edit ID 1603) */}
            <div class="space-y-1">
              <label class="font-bold text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                {t("address_label")}
              </label>
              <input
                type="text"
                readonly
                value={props.task?.url || ""}
                class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-main)] font-mono text-[11px] select-all focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* The file saved as (Static ID 1611 y Edit ID 1040) */}
            <div class="space-y-1">
              <label class="font-bold text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                {t("file_saved_as")}
              </label>
              <input
                type="text"
                readonly
                value={props.task?.destination_path || ""}
                class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-main)] font-mono text-[11px] select-all focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Checkbox Don't show again (Button ID 1607) */}
            <div class="pt-1">
              <label class="flex items-center gap-2 cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={dontShowAgain()}
                  onChange={(e) => setDontShowAgain(e.currentTarget.checked)}
                  class="w-3.5 h-3.5 rounded-none border-[var(--border)] bg-[var(--bg-primary)] accent-[var(--accent)] cursor-pointer"
                />
                <span>{t("dont_show_again")}</span>
              </label>
            </div>

            {/* Estado de error si existió */}
            <Show when={errorStatus()}>
              <div class="text-[10px] text-red-400 font-mono bg-red-950/20 p-2 border border-red-900/40">
                {errorStatus()}
              </div>
            </Show>
          </div>

          {/* Botones de Acción (Open ID 1164 | Open with ID 1639 | Open folder ID 1606 | Close ID 1079) */}
          <div class="border-t border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <button
                onClick={handleOpenFile}
                class="border border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-primary)] px-3.5 py-1.5 font-bold hover:brightness-110 cursor-pointer uppercase tracking-wider text-[11px] flex items-center gap-1.5 shadow-sm transition-all"
              >
                <ExternalLink size={12} />
                <span>{t("open_file")}</span>
              </button>

              <button
                onClick={handleOpenFolder}
                class="border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-bold text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer uppercase tracking-wider text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Folder size={12} />
                <span>{t("open_folder")}</span>
              </button>
            </div>

            <button
              onClick={props.onClose}
              class="border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-1.5 font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer uppercase tracking-wider text-[11px] transition-colors"
            >
              {t("close")}
            </button>
          </div>
        </div>
      );

  return (
    <Show when={props.isOpen && props.task}>
      {props.isStandaloneWindow ? (
        content
      ) : (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          {content}
        </div>
      )}
    </Show>
  );
}
