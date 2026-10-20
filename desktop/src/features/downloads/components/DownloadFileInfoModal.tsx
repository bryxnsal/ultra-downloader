import { createSignal, createEffect, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { DownloadTask, UrlMetadata } from "../types";
import { formatBytes } from "../../../shared/utils";
import { joinPaths, splitPath, normalizePath } from "../../../shared/pathUtils";
import { useSettings } from "../../../shared/stores/settingsStore";
import { WindowControls } from "../../../shared/components/WindowControls";
import { X, Folder, HelpCircle, HardDrive, ShieldCheck, AlertTriangle } from "lucide-solid";

interface DownloadFileInfoModalProps {
  isOpen: boolean;
  initialUrl?: string;
  suggestedFilename?: string;
  audioUrl?: string | null;
  isStandaloneWindow?: boolean;
  onClose: () => void;
  onStartDownload: (task: DownloadTask) => void;
  onDownloadLater: (task: DownloadTask) => void;
}

export function DownloadFileInfoModal(props: DownloadFileInfoModalProps) {
  const { settings, t } = useSettings();

  const [urlInput, setUrlInput] = createSignal(props.initialUrl || "");
  const [audioUrlInput, setAudioUrlInput] = createSignal(props.audioUrl || null);
  const [category, setCategory] = createSignal("General");
  const [baseFolder, setBaseFolder] = createSignal(settings().saveToDefault);
  const [savePath, setSavePath] = createSignal(settings().saveToDefault);
  const [rememberPath, setRememberPath] = createSignal(true);
  const [description, setDescription] = createSignal("");
  const [probing, setProbing] = createSignal(false);
  const [probedMeta, setProbedMeta] = createSignal<UrlMetadata | null>(null);
  const [showFfmpegWarning, setShowFfmpegWarning] = createSignal(false);
  const [pendingAction, setPendingAction] = createSignal<"start" | "later" | null>(null);

  const categories = ["General", "Compressed", "Documents", "Music", "Programs", "Video"];

  const computeDestination = (baseDir: string, cat: string, filename: string): string => {
    const cleanFile = filename || "download.bin";
    const cleanBase = baseDir || settings().saveToDefault || "";
    if (cat === "General") {
      return joinPaths(cleanBase, cleanFile);
    }
    return joinPaths(cleanBase, cat, cleanFile);
  };

  const updateCategoryAndPath = (newCat: string) => {
    setCategory(newCat);
    const { filename } = splitPath(savePath());
    const finalFile = filename || probedMeta()?.suggested_filename || "download.bin";
    setSavePath(computeDestination(baseFolder(), newCat, finalFile));
  };

  const probeUrlHandler = async () => {
    const u = urlInput().trim();
    if (!u) return;
    setProbing(true);

    const customFilename = props.suggestedFilename?.trim() || "";

    try {
      const meta = await invoke<UrlMetadata>("probe_url", { url: u });
      const finalFilename = customFilename || (meta.suggested_filename && !meta.suggested_filename.startsWith("videoplayback") ? meta.suggested_filename : null) || customFilename || meta.suggested_filename || "download.bin";

      setProbedMeta({
        ...meta,
        audio_url: audioUrlInput(),
        suggested_filename: finalFilename
      });
      setSavePath(computeDestination(baseFolder(), category(), finalFilename));
    } catch {
      const fallbackName = customFilename || u.split("/").pop()?.split("?")[0] || "download.bin";
      setProbedMeta({
        url: u,
        audio_url: audioUrlInput(),
        suggested_filename: fallbackName,
        content_length: 0,
        accepts_ranges: false,
        content_type: "application/octet-stream",
      });
      setSavePath(computeDestination(baseFolder(), category(), fallbackName));
    } finally {
      setProbing(false);
    }
  };

  createEffect(() => {
    const nextUrl = props.initialUrl;
    if (nextUrl && nextUrl.trim() !== "") {
      setUrlInput(nextUrl.trim());
      setAudioUrlInput(props.audioUrl || null);
      probeUrlHandler();
    }
  });

  onMount(() => {
    if (props.initialUrl) {
      setUrlInput(props.initialUrl);
      setAudioUrlInput(props.audioUrl || null);
      probeUrlHandler();
    }
  });

  const createTaskObject = (status: "Downloading" | "Queued"): DownloadTask => {
    const meta = probedMeta();
    const total = meta?.content_length || 0;
    const conns = settings().maxConnectionsNumber;
    const chunkSize = conns > 0 && total > 0 ? Math.floor(total / conns) : 0;
    const fname = meta?.suggested_filename || urlInput().split("/").pop()?.split("?")[0] || "download.bin";

    return {
      id: "task-" + Date.now(),
      url: urlInput().trim(),
      audio_url: audioUrlInput(),
      filename: fname,
      destination_path: savePath(),
      total_bytes: total,
      downloaded_bytes: 0,
      speed_bytes_sec: 0,
      status: status,
      supports_ranges: meta?.accepts_ranges ?? true,
      connections_count: conns,
      chunks: Array.from({ length: conns }, (_, i) => ({
        id: i,
        start_byte: i * chunkSize,
        current_byte: i * chunkSize,
        end_byte: i === conns - 1 ? total - 1 : (i + 1) * chunkSize - 1,
        downloaded_bytes: 0,
        speed_bytes_sec: 0,
        active: status === "Downloading",
        is_completed: false,
      })),
      created_at: Math.floor(Date.now() / 1000),
    };
  };

  const isYouTubeMuxedVideo = () => {
    // Solo aplica a videos que tienen un stream de audio separado para acoplar
    const hasAudioStream = Boolean(audioUrlInput());
    const u = urlInput();
    const isYt = u.includes("googlevideo.com") || u.includes("youtube.com") || u.includes("youtu.be");
    return hasAudioStream && isYt;
  };

  const verifyFfmpegBeforeAction = async (action: "start" | "later"): Promise<boolean> => {
    if (!isYouTubeMuxedVideo()) {
      return true;
    }

    try {
      const hasFfmpeg = await invoke<boolean>("check_ffmpeg_installed");
      if (!hasFfmpeg) {
        setPendingAction(action);
        setShowFfmpegWarning(true);
        return false;
      }
    } catch {
      // Si falla la verificación, continuar sin bloquear
    }

    return true;
  };

  const handleStart = async (overrideWithoutAudio = false) => {
    const u = urlInput().trim();
    if (!u) return;

    if (!overrideWithoutAudio) {
      const ok = await verifyFfmpegBeforeAction("start");
      if (!ok) return;
    }

    try {
      const meta = probedMeta();
      const fname = meta?.suggested_filename || u.split("/").pop()?.split("?")[0] || "download.bin";
      const targetAudioUrl = overrideWithoutAudio ? null : audioUrlInput();

      const createdTask = await invoke<DownloadTask>("add_task", {
        url: u,
        audioUrl: targetAudioUrl,
        filename: fname,
        destinationPath: savePath(),
        connections: settings().maxConnectionsNumber,
      });

      await invoke("start_download", { taskId: createdTask.id });
      await Promise.resolve(props.onStartDownload(createdTask));
    } catch {
      await Promise.resolve(props.onStartDownload(createTaskObject("Downloading")));
    }
  };

  const handleLater = async (overrideWithoutAudio = false) => {
    const u = urlInput().trim();
    if (!u) return;

    if (!overrideWithoutAudio) {
      const ok = await verifyFfmpegBeforeAction("later");
      if (!ok) return;
    }

    try {
      const meta = probedMeta();
      const fname = meta?.suggested_filename || u.split("/").pop()?.split("?")[0] || "download.bin";
      const targetAudioUrl = overrideWithoutAudio ? null : audioUrlInput();

      const createdTask = await invoke<DownloadTask>("add_task", {
        url: u,
        audioUrl: targetAudioUrl,
        filename: fname,
        destinationPath: savePath(),
        connections: settings().maxConnectionsNumber,
      });
      await Promise.resolve(props.onDownloadLater(createdTask));
    } catch {
      await Promise.resolve(props.onDownloadLater(createTaskObject("Queued")));
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const currentFull = savePath();
      const { dir: currentDir, filename: currentFilename } = splitPath(currentFull);

      const chosenFolder = await invoke<string | null>("pick_folder", {
        defaultPath: currentDir || baseFolder() || settings().saveToDefault,
      });

      if (chosenFolder) {
        setBaseFolder(chosenFolder);
        const finalFile = currentFilename || probedMeta()?.suggested_filename || "download.bin";
        const newPath = computeDestination(chosenFolder, category(), finalFile);
        setSavePath(newPath);
      }
    } catch (err) {
      console.error("Error al seleccionar carpeta:", err);
    }
  };

  const renderContent = () => (
    <div
      class={
        props.isStandaloneWindow
          ? "w-full h-full bg-[var(--bg-secondary)] flex flex-col justify-between text-[12px] select-none relative"
          : "w-full max-w-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl rounded-none flex flex-col text-[12px] relative"
      }
    >
      {/* FFmpeg Warning Sub-Modal */}
      <Show when={showFfmpegWarning()}>
        <div class="absolute inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="w-full max-w-md border-2 border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3 font-mono text-[11px] shadow-2xl">
            <div class="flex items-center gap-2 text-amber-400 font-bold border-b border-[var(--border)] pb-2">
              <AlertTriangle class="w-4 h-4 shrink-0" />
              <span class="uppercase tracking-wider">{t("ffmpeg_warning_title")}</span>
            </div>

            <p class="text-[10px] text-[var(--text-main)] leading-relaxed">
              {t("ffmpeg_warning_desc")}
            </p>

            <div class="p-2 bg-[var(--bg-primary)] border border-[var(--border)] text-[9px] text-[var(--text-muted)] space-y-1">
              <p>• {t("ffmpeg_install_hint_linux")}</p>
              <p>• {t("ffmpeg_configure_hint")}</p>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                onClick={() => {
                  setShowFfmpegWarning(false);
                  const act = pendingAction();
                  setPendingAction(null);
                  if (act === "start") handleStart(true);
                  if (act === "later") handleLater(true);
                }}
                class="px-3 py-1.5 border border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-bold uppercase text-[10px] cursor-pointer"
              >
                {t("continue_without_audio")}
              </button>

              <button
                onClick={() => {
                  setShowFfmpegWarning(false);
                  setPendingAction(null);
                }}
                class="px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold uppercase text-[10px] cursor-pointer"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Header Frameless Arrastrable con Controles Custom */}
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-white"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] uppercase">
            {t("file_info_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={true} />
      </div>

      {/* Formulario */}
      <div class="px-3.5 py-2.5 space-y-2 flex-1 overflow-y-auto">
        {/* URL Row */}
        <div class="grid grid-cols-6 gap-2 items-center">
          <label class="col-span-1 font-bold text-[var(--text-muted)] uppercase tracking-wide">
            {t("url_label")}
          </label>
          <div class="col-span-4 flex gap-1">
            <input
              type="text"
              value={urlInput()}
              onInput={(e) => setUrlInput(e.currentTarget.value)}
              placeholder="https://domain.com/file.iso"
              class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-main)] font-mono text-[11px] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={probeUrlHandler}
            disabled={probing() || !urlInput()}
            class="col-span-1 border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 cursor-pointer uppercase text-[10px] tracking-wider transition-colors"
          >
            {probing() ? t("probing") : t("probe_head")}
          </button>
        </div>

        {/* Category Row */}
        <div class="grid grid-cols-6 gap-2 items-center">
          <label class="col-span-1 font-bold text-[var(--text-muted)] uppercase tracking-wide">
            {t("category_label")}
          </label>
          <div class="col-span-3 flex gap-1">
            <select
              value={category()}
              onChange={(e) => updateCategoryAndPath(e.currentTarget.value)}
              class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              {categories.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              title="Nueva categoría"
              class="border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] cursor-pointer"
            >
              +
            </button>
          </div>

          {/* Preview / Badge de tamaño detectado */}
          <div class="col-span-2 flex items-center justify-end gap-1.5 px-2 py-0.5 border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] text-[var(--text-muted)]">
            <HardDrive size={13} class="text-[var(--accent)] shrink-0" />
            <span class="truncate">
              {probedMeta()?.content_length && probedMeta()!.content_length! > 0
                ? formatBytes(probedMeta()!.content_length!)
                : t("unknown")}
            </span>
            <span
              class={`px-1 py-0.2 text-[9px] uppercase font-mono ${
                probedMeta()?.accepts_ranges
                  ? "text-[var(--accent)] bg-[var(--accent)]/10"
                  : "text-red-400 bg-red-400/10"
              }`}
            >
              {probedMeta()?.accepts_ranges ? "RANGES" : "NO-RANGE"}
            </span>
          </div>
        </div>

        {/* Save As Row */}
        <div class="grid grid-cols-6 gap-2 items-center">
          <label class="col-span-1 font-bold text-[var(--text-muted)] uppercase tracking-wide">
            {t("save_as_label")}
          </label>
          <div class="col-span-4">
            <input
              type="text"
              value={savePath()}
              onInput={(e) => setSavePath(e.currentTarget.value)}
              class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-main)] font-mono text-[11px] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={handleBrowseFolder}
            class="col-span-1 border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer uppercase text-[11px] flex items-center justify-center gap-1 transition-colors"
          >
            <Folder size={12} />
            <span>{t("browse")}</span>
          </button>
        </div>

        {/* Checkbox Remember Path */}
        <div class="grid grid-cols-6 gap-2 items-center">
          <div class="col-span-1"></div>
          <label class="col-span-5 flex items-center gap-2 cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={rememberPath()}
              onChange={(e) => setRememberPath(e.currentTarget.checked)}
              class="w-3.5 h-3.5 rounded-none border-[var(--border)] bg-[var(--bg-primary)] accent-[var(--accent)] cursor-pointer"
            />
            <span>
              {t("remember_category_path")}: <b class="text-[var(--text-main)]">"{category()}"</b>
            </span>
          </label>
        </div>

        {/* Description Row */}
        <div class="grid grid-cols-6 gap-2 items-center">
          <label class="col-span-1 font-bold text-[var(--text-muted)] uppercase tracking-wide">
            {t("description_label")}
          </label>
          <div class="col-span-5">
            <input
              type="text"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder={t("optional_comment_placeholder")}
              class="w-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-main)] text-[11px] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Footer de Acciones (IDM Style: Download Later | Start Download | Cancel) */}
      <div class="border-t border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2 flex items-center justify-between shrink-0">
        <button
          onClick={handleLater}
          disabled={!urlInput().trim()}
          class="border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1 font-bold text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 cursor-pointer uppercase tracking-wider text-[11px] transition-colors"
        >
          {t("download_later")}
        </button>

        <div class="flex items-center gap-2">
          <button
            onClick={handleStart}
            disabled={!urlInput().trim()}
            class="border border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-primary)] px-4 py-1 font-bold hover:brightness-110 disabled:opacity-40 cursor-pointer uppercase tracking-wider text-[11px] shadow-sm transition-all"
          >
            {t("start_download")}
          </button>
          <button
            onClick={props.onClose}
            class="border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1 font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer uppercase tracking-wider text-[11px] transition-colors"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );

  if (props.isStandaloneWindow) {
    return renderContent();
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
        {renderContent()}
      </div>
    </Show>
  );
}
