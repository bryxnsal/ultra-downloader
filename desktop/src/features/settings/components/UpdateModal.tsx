import { createSignal, onMount, Show } from "solid-js";
import { useSettings } from "../../../shared/stores/settingsStore";
import { WindowControls } from "../../../shared/components/WindowControls";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, AlertTriangle, ArrowUpRight } from "lucide-solid";

interface UpdateModalProps {
  isOpen: boolean;
  isStandaloneWindow?: boolean;
  onClose: () => void;
}

type UpdateStatus =
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "ready_to_restart"
  | "error";

export function UpdateModal(props: UpdateModalProps) {
  const { t } = useSettings();
  const currentAppVersion = "0.2.6";

  const [status, setStatus] = createSignal<UpdateStatus>("checking");
  const [updateInfo, setUpdateInfo] = createSignal<Update | null>(null);
  const [downloadedBytes, setDownloadedBytes] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [errorMessage, setErrorMessage] = createSignal("");

  const percent = () => {
    const total = totalBytes();
    if (!total || total === 0) return 0;
    return Math.min(100, Math.floor((downloadedBytes() / total) * 100));
  };

  const checkForUpdates = async () => {
    setStatus("checking");
    setErrorMessage("");
    setDownloadedBytes(0);
    setTotalBytes(0);

    // Timeout de 8 segundos para evitar cuelgues indefinidos
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout checking update endpoint")), 8000)
    );

    try {
      // 1. Intentar verificación con el plugin oficial de Tauri
      const checkPromise = check({ timeout: 6000 });
      const update = (await Promise.race([checkPromise, timeoutPromise])) as Update | null;

      if (update && update.available) {
        setUpdateInfo(update);
        setStatus("available");
        return;
      } else if (update && !update.available) {
        setStatus("up_to_date");
        return;
      }

      // 2. Fallback de comprobación directa contra GitHub Releases latest.json
      const res = await fetch(
        "https://raw.githubusercontent.com/bryxnsal/ultra-downloader/main/core/tauri.conf.json"
      ).catch(() => null);

      if (res && res.ok) {
        const conf = await res.json().catch(() => null);
        const remoteVersion = conf?.version;
        if (remoteVersion && remoteVersion !== currentAppVersion) {
          setUpdateInfo({
            version: remoteVersion,
            currentVersion: currentAppVersion,
            body: "New update released on GitHub repository.",
            available: true,
            downloadAndInstall: async () => {},
          } as unknown as Update);
          setStatus("available");
          return;
        }
      }

      setStatus("up_to_date");
    } catch (err: any) {
      console.warn("Direct update plugin check failed, fallback to GitHub releases info:", err);
      try {
        const ghRes = await fetch(
          "https://api.github.com/repos/bryxnsal/ultra-downloader/releases/latest"
        );
        if (ghRes.ok) {
          const releaseData = await ghRes.json();
          const tag = (releaseData.tag_name || "").replace(/^v/, "");
          if (tag && tag !== currentAppVersion) {
            setUpdateInfo({
              version: tag,
              currentVersion: currentAppVersion,
              body: releaseData.body || "New version available on GitHub.",
              available: true,
              downloadAndInstall: async () => {},
            } as unknown as Update);
            setStatus("available");
            return;
          } else {
            setStatus("up_to_date");
            return;
          }
        }
      } catch {}

      // Si no hay red o fallo definitivo
      setErrorMessage(err?.message || String(err));
      setStatus("error");
    }
  };

  const startDownloadAndInstall = async () => {
    const update = updateInfo();
    if (!update) return;

    setStatus("downloading");
    setDownloadedBytes(0);
    setTotalBytes(0);

    try {
      if (typeof update.downloadAndInstall === "function") {
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            setTotalBytes(event.data.contentLength || 0);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setDownloadedBytes(downloaded);
          } else if (event.event === "Finished") {
            setStatus("ready_to_restart");
          }
        });
        setStatus("ready_to_restart");
      } else {
        await handleOpenReleases();
      }
    } catch (err: any) {
      console.error("Download failed:", err);
      setErrorMessage(err?.message || String(err));
      setStatus("error");
    }
  };

  const handleRelaunch = async () => {
    try {
      const update = updateInfo();
      if (update?.version) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("sync_appimage_filename", { newVersion: update.version }).catch(() => {});
      }
      await relaunch();
    } catch (err: any) {
      console.error("Relaunch failed:", err);
      setErrorMessage(err?.message || String(err));
      setStatus("error");
    }
  };

  const handleOpenReleases = async () => {
    try {
      await openUrl("https://github.com/bryxnsal/ultra-downloader/releases/latest");
    } catch {
      window.open("https://github.com/bryxnsal/ultra-downloader/releases/latest", "_blank");
    }
  };

  onMount(() => {
    checkForUpdates();
  });

  const content = (
    <div
      class={
        props.isStandaloneWindow
          ? "w-full h-full bg-[var(--bg-surface)] flex flex-col justify-between text-[11px] select-none"
          : "w-full max-w-md border-2 border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl rounded-none flex flex-col text-[11px]"
      }
    >
      {/* Frameless Drag Bar */}
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-white shrink-0"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] uppercase">
            {t("update_window_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={true} />
      </div>

      {/* Modal Body */}
      <div class="flex-1 p-5 space-y-4 bg-[var(--bg-primary)] flex flex-col justify-center">
        {/* Estado: CHECKING */}
        <Show when={status() === "checking"}>
          <div class="py-6 flex flex-col items-center justify-center space-y-3 text-center">
            <div class="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin"></div>
            <p class="font-bold tracking-wider uppercase text-[var(--text-main)] text-[11px]">
              {t("update_checking")}
            </p>
          </div>
        </Show>

        {/* Estado: UP_TO_DATE */}
        <Show when={status() === "up_to_date"}>
          <div class="py-6 flex flex-col items-center justify-center space-y-2 text-center">
            <span class="px-2 py-0.5 bg-[var(--accent)] text-[var(--bg-primary)] font-mono font-bold text-[10px] uppercase">
              OK
            </span>
            <p class="font-bold tracking-wider uppercase text-[var(--text-main)] text-[11px]">
              {t("update_latest_title")}
            </p>
            <p class="text-[10px] text-[var(--text-muted)] font-mono">
              {t("update_current_installed")}: <span class="text-[var(--text-main)] font-bold">v{currentAppVersion}</span>
            </p>
          </div>
        </Show>

        {/* Estado: AVAILABLE */}
        <Show when={status() === "available"}>
          <div class="space-y-3">
            <div class="p-3 bg-[var(--bg-secondary)] border-l-4 border-[var(--accent)] space-y-1">
              <p class="font-bold text-[var(--accent)] uppercase tracking-wider text-[11px]">
                {t("update_detected_title")}
              </p>
              <p class="text-[10px] text-[var(--text-main)]">
                {t("update_version_diff")}: <span class="font-mono text-[var(--text-muted)]">v{currentAppVersion}</span> → <span class="font-mono font-bold text-[var(--accent)]">v{updateInfo()?.version}</span>
              </p>
            </div>

            <Show when={updateInfo()?.body}>
              <div class="space-y-1">
                <span class="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  {t("update_release_notes")}:
                </span>
                <div class="max-h-24 overflow-y-auto p-2 bg-[var(--bg-secondary)] border border-[var(--border)] font-mono text-[9px] text-[var(--text-main)] whitespace-pre-wrap select-text">
                  {updateInfo()?.body}
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Estado: DOWNLOADING */}
        <Show when={status() === "downloading"}>
          <div class="space-y-3 py-2">
            <div class="flex justify-between items-center text-[10px] font-mono">
              <span class="font-bold text-[var(--accent)] uppercase">{t("update_downloading")}...</span>
              <span class="text-[var(--text-main)] font-bold">{percent()}%</span>
            </div>
            <div class="w-full h-3 bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
              <div
                class="h-full bg-[var(--accent)] transition-all duration-150"
                style={{ width: `${percent()}%` }}
              ></div>
            </div>
            <div class="flex justify-between text-[9px] text-[var(--text-muted)] font-mono">
              <span>{(downloadedBytes() / (1024 * 1024)).toFixed(1)} MB</span>
              <span>{totalBytes() > 0 ? `${(totalBytes() / (1024 * 1024)).toFixed(1)} MB` : "..."}</span>
            </div>
          </div>
        </Show>

        {/* Estado: READY_TO_RESTART */}
        <Show when={status() === "ready_to_restart"}>
          <div class="py-4 flex flex-col items-center justify-center space-y-2 text-center">
            <span class="px-2 py-0.5 bg-[var(--accent)] text-[var(--bg-primary)] font-mono font-bold text-[10px] uppercase">
              READY
            </span>
            <p class="font-bold tracking-wider uppercase text-[var(--text-main)] text-[11px]">
              {t("update_ready_title")}
            </p>
            <p class="text-[10px] text-[var(--text-muted)] max-w-xs">
              {t("update_ready_desc")}
            </p>
          </div>
        </Show>

        {/* Estado: ERROR */}
        <Show when={status() === "error"}>
          <div class="p-3 bg-[var(--bg-secondary)] border-l-4 border-red-500 space-y-2">
            <div class="flex items-center gap-2 text-red-400 font-bold">
              <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
              <span class="uppercase tracking-wider text-[10px]">{t("update_error_title")}</span>
            </div>
            <p class="text-[10px] text-[var(--text-muted)] font-mono break-all">
              {errorMessage()}
            </p>
            <button
              onClick={handleOpenReleases}
              class="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--accent)] underline hover:opacity-80 cursor-pointer font-bold"
            >
              <ArrowUpRight class="w-3.5 h-3.5" />
              <span>{t("update_open_github_manually")}</span>
            </button>
          </div>
        </Show>
      </div>

      {/* Modal Footer Controls */}
      <div class="h-11 px-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-between shrink-0">
        <div>
          <Show when={status() === "error" || status() === "up_to_date"}>
            <button
              onClick={checkForUpdates}
              class="px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-primary)] text-[var(--text-main)] font-bold text-[10px] uppercase cursor-pointer"
            >
              {t("update_retry")}
            </button>
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Show when={status() === "available"}>
            <button
              onClick={startDownloadAndInstall}
              class="px-4 py-1.5 bg-[var(--accent)] border border-[var(--accent)] text-[var(--bg-primary)] font-bold text-[11px] hover:opacity-90 active:translate-y-[1px] cursor-pointer flex items-center gap-1.5"
            >
              <Download class="w-3.5 h-3.5" />
              <span>{t("update_download_install")}</span>
            </button>
          </Show>

          <Show when={status() === "ready_to_restart"}>
            <button
              onClick={handleRelaunch}
              class="px-4 py-1.5 bg-[var(--accent)] border border-[var(--accent)] text-[var(--bg-primary)] font-bold text-[11px] hover:opacity-90 active:translate-y-[1px] cursor-pointer"
            >
              {t("update_restart_apply")}
            </button>
          </Show>

          <button
            onClick={props.onClose}
            class="px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold text-[10px] uppercase cursor-pointer"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Show when={props.isOpen}>
      {props.isStandaloneWindow ? (
        content
      ) : (
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 select-none">
          {content}
        </div>
      )}
    </Show>
  );
}
