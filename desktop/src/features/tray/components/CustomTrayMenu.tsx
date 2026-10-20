import { createSignal, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../../../shared/stores/settingsStore";

function IconAdd(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square">
      <line x1="6" y1="1" x2="6" y2="11" />
      <line x1="1" y1="6" x2="11" y2="6" />
    </svg>
  );
}

function IconPause(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="2" width="3" height="8" />
      <rect x="7" y="2" width="3" height="8" />
    </svg>
  );
}

function IconStop(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="2" width="8" height="8" />
    </svg>
  );
}

function IconLimiter(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="1" y="8" width="2" height="3" />
      <rect x="4" y="5" width="2" height="6" />
      <rect x="7" y="3" width="2" height="8" />
      <rect x="10" y="1" width="2" height="10" />
    </svg>
  );
}

function IconSettings(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">
      <rect x="1" y="1" width="10" height="10" />
      <rect x="4" y="4" width="4" height="4" fill="currentColor" />
    </svg>
  );
}

function IconRestore(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">
      <rect x="1" y="3" width="7" height="7" />
      <path d="M4 3V1H11V8H9" />
    </svg>
  );
}

function IconExit(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">
      <path d="M5 1H1V11H5" />
      <line x1="4" y1="6" x2="11" y2="6" />
      <polyline points="8,3 11,6 8,9" />
    </svg>
  );
}

export function CustomTrayMenu() {
  const { settings, updateSettings, t } = useSettings();
  const [speedLimitActive, setSpeedLimitActive] = createSignal(settings().speedLimitEnabled);

  onMount(async () => {
    const handleBlur = () => {
      closeMenu();
    };

    window.addEventListener("blur", handleBlur);

    try {
      const win = getCurrentWindow();
      const unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          win.hide();
        }
      });

      onCleanup(() => {
        window.removeEventListener("blur", handleBlur);
        unlisten();
      });
    } catch {
      onCleanup(() => {
        window.removeEventListener("blur", handleBlur);
      });
    }
  });

  const closeMenu = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_tray_menu");
    } catch {
      try {
        const win = getCurrentWindow();
        await win.hide();
      } catch {}
    }
  };

  const handleRestore = async () => {
    await closeMenu();
    try {
      await invoke("restore_main_window");
    } catch {}
  };

  const handleAddDownload = async () => {
    await closeMenu();
    try {
      await invoke("open_aux_window", {
        windowType: "file-info",
        taskId: null,
        initialUrl: null,
        audioUrl: null,
        suggestedFilename: null,
      });
    } catch {}
  };

  const handlePauseAll = async () => {
    await closeMenu();
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("tray-pause-all", null);
    } catch {}
  };

  const handleStopAll = async () => {
    await closeMenu();
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("tray-stop-all", null);
    } catch {}
  };

  const handleToggleLimiter = async () => {
    const newState = !speedLimitActive();
    setSpeedLimitActive(newState);
    updateSettings({ speedLimitEnabled: newState });
    try {
      const speedKb = Math.floor(settings().speedLimitBytesSec / 1024) || 2048;
      await invoke("set_speed_limiter", { enabled: newState, speedKbSec: speedKb });
    } catch {}
  };

  const handleOpenSettings = async () => {
    await closeMenu();
    try {
      await invoke("open_aux_window", {
        windowType: "settings",
        taskId: null,
        initialUrl: null,
        audioUrl: null,
        suggestedFilename: null,
      });
    } catch {}
  };

  const handleExit = async () => {
    try {
      await invoke("exit_app");
    } catch {
      window.close();
    }
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      class="w-full h-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-main)] font-mono text-[11px] flex flex-col shadow-2xl overflow-hidden select-none"
    >
      {/* Encabezado del menú flotante */}
      <div class="px-2.5 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--accent)] font-bold tracking-wider">
        <div class="flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 bg-white"></span>
          <span>ULTRA-DOWNLOADER</span>
        </div>
        <span class="text-[9px] text-[var(--text-muted)] font-normal">v0.1</span>
      </div>

      {/* Lista de Acciones Temáticas */}
      <div class="p-1 space-y-0.5 flex-1 overflow-y-auto">
        <button
          onClick={handleAddDownload}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left hover:text-[var(--accent)] transition-colors cursor-pointer rounded-none"
        >
          <IconAdd class="text-[var(--accent)] shrink-0" />
          <span>{t("add_url_title")}...</span>
        </button>

        <div class="my-1 border-t border-[var(--border)]/60" />

        <button
          onClick={handlePauseAll}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left hover:text-[var(--text-main)] transition-colors cursor-pointer rounded-none"
        >
          <IconPause class="text-amber-400 shrink-0" />
          <span>{t("pause_all")}</span>
        </button>

        <button
          onClick={handleStopAll}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left hover:text-red-400 transition-colors cursor-pointer rounded-none"
        >
          <IconStop class="text-red-400 shrink-0" />
          <span>{t("stop_all")}</span>
        </button>

        <div class="my-1 border-t border-[var(--border)]/60" />

        {/* Speed Limiter toggle */}
        <button
          onClick={handleToggleLimiter}
          class="w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-[var(--bg-hover)] text-left transition-colors cursor-pointer rounded-none"
        >
          <div class="flex items-center gap-2">
            <IconLimiter class="text-[var(--accent)] shrink-0" />
            <span>{t("speed_limiter")}</span>
          </div>
          <span
            class={`text-[9px] font-bold px-1.5 py-0.2 rounded-none border ${
              speedLimitActive()
                ? "bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)]"
                : "text-[var(--text-muted)] border-[var(--border)]"
            }`}
          >
            {speedLimitActive() ? "ON" : "OFF"}
          </span>
        </button>

        <button
          onClick={handleOpenSettings}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left hover:text-[var(--accent)] transition-colors cursor-pointer rounded-none"
        >
          <IconSettings class="text-[var(--text-muted)] shrink-0" />
          <span>{t("options")}...</span>
        </button>

        <button
          onClick={handleRestore}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left hover:text-[var(--accent)] transition-colors cursor-pointer rounded-none"
        >
          <IconRestore class="text-[var(--accent)] shrink-0" />
          <span class="font-semibold">{t("restore") || "Restore"}</span>
        </button>

        <div class="my-1 border-t border-[var(--border)]/60" />

        <button
          onClick={handleExit}
          class="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-red-600/20 text-red-400 text-left transition-colors cursor-pointer rounded-none"
        >
          <IconExit class="text-red-400 shrink-0" />
          <span>{t("exit")}</span>
        </button>
      </div>
    </div>
  );
}
