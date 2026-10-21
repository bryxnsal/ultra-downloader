import { createSignal } from "solid-js";
import { DEFAULT_SETTINGS, SettingsState, Theme, CustomTheme, ColorMode } from "../../features/settings/types";
import { Language, translations, TranslationKey } from "../i18n";

const STORAGE_KEY = "udm_settings_v1";

function getInitialLanguage(): Language {
  const sysLang = navigator.language?.toLowerCase() || "";
  if (sysLang.startsWith("es")) {
    return "es";
  }
  return "en";
}

function loadPersistedSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.exceptionServers === "*.update.microsoft.com download.windowsupdate.com siteseal.thawte.com") {
        parsed.exceptionServers = "";
      }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch {}

  return {
    ...DEFAULT_SETTINGS,
    language: getInitialLanguage(),
  };
}

const [settings, setSettings] = createSignal<SettingsState>(loadPersistedSettings());

let autostartUserChanged = false;

if (typeof window !== "undefined") {
  import("@tauri-apps/api/core").then(({ invoke }) => {
    invoke<{ download_dir: string; temp_dir: string; system_ffmpeg_path: string | null }>("get_system_directories")
      .then((dirs) => {
        setSettings((prev) => {
          let changed = false;
          const next = { ...prev };
          if (!next.saveToDefault) {
            next.saveToDefault = dirs.download_dir;
            changed = true;
          }
          if (!next.tempPath) {
            next.tempPath = dirs.temp_dir;
            changed = true;
          }
          if (!next.ffmpegPath && dirs.system_ffmpeg_path) {
            next.ffmpegPath = dirs.system_ffmpeg_path;
            changed = true;
          }
          if (changed) {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {}
            syncToBackend(next);
          }
          return next;
        });
      })
      .catch(() => {});

    invoke<boolean>("is_autostart")
      .then((enabled) => {
        if (autostartUserChanged) return;
        setSettings((prev) => {
          if (prev.autostartEnabled !== enabled) {
            const next = { ...prev, autostartEnabled: enabled };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });
      })
      .catch(() => {});
  }).catch(() => {});
}

function getSystemColorMode(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

function resolveEffectiveColorMode(mode: ColorMode | undefined): "dark" | "light" {
  if (!mode || mode === "auto") {
    return getSystemColorMode();
  }
  return mode;
}

function syncToBackend(current: SettingsState) {
  if (typeof window === "undefined") return;
  import("@tauri-apps/api/core").then(({ invoke }) => {
    invoke("sync_browser_config", {
      config: {
        interceptExtensions: current.interceptExtensions,
        exceptionServers: current.exceptionServers,
        grabberTheme: current.grabberTheme || "same_as_app",
        appTheme: current.theme || "matrix",
        colorMode: current.colorMode || "dark",
        customThemes: current.customThemes || [],
        language: current.language,
      },
    }).catch(() => {});

    invoke("set_ffmpeg_path", {
      path: current.ffmpegPath?.trim() || null,
    }).catch(() => {});
  }).catch(() => {});
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (typeof window === "undefined") return;

  autostartUserChanged = true;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_autostart", { enabled });

  setSettings((prev) => {
    if (prev.autostartEnabled === enabled) return prev;
    const next = { ...prev, autostartEnabled: enabled };
    broadcastSettings(next);
    return next;
  });
}

// Initial sync to local bridge server
if (typeof window !== "undefined") {
  syncToBackend(settings());
}

function broadcastSettings(next: SettingsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}

  syncToBackend(next);

  import("@tauri-apps/api/event").then(({ emit }) => {
    emit("settings-changed", next).catch(() => {});
  }).catch(() => {});
}

function applyDomTheme(theme: Theme, colorMode?: ColorMode, customThemes?: CustomTheme[]) {
  const root = document.documentElement;
  const effectiveMode = resolveEffectiveColorMode(colorMode);
  root.setAttribute("data-color-mode", effectiveMode);

  const custom = customThemes?.find((ct) => ct.id === theme);
  if (custom) {
    root.setAttribute("data-theme", "custom");
    root.style.setProperty("--bg-primary", custom.bgPrimary);
    root.style.setProperty("--bg-secondary", custom.bgSecondary);
    root.style.setProperty("--bg-surface", custom.bgSurface);
    root.style.setProperty("--border", custom.border);
    root.style.setProperty("--text-main", custom.textMain);
    root.style.setProperty("--text-muted", custom.textMuted);
    root.style.setProperty("--accent", custom.accent);
    root.style.setProperty("--accent-muted", custom.accentMuted || custom.accent);
    return;
  }

  root.style.removeProperty("--bg-primary");
  root.style.removeProperty("--bg-secondary");
  root.style.removeProperty("--bg-surface");
  root.style.removeProperty("--border");
  root.style.removeProperty("--text-main");
  root.style.removeProperty("--text-muted");
  root.style.removeProperty("--accent");
  root.style.removeProperty("--accent-muted");

  if (theme === "matrix") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

applyDomTheme(settings().theme, settings().colorMode, settings().customThemes);

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settings().colorMode === "auto") {
      applyDomTheme(settings().theme, "auto", settings().customThemes);
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const next = JSON.parse(e.newValue);
        setSettings(next);
        applyDomTheme(next.theme, next.colorMode, next.customThemes);
      } catch {}
    }
  });

  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<SettingsState>("settings-changed", (event) => {
      const next = event.payload;
      setSettings(next);
      if (next.theme || next.colorMode) {
        applyDomTheme(next.theme, next.colorMode, next.customThemes);
      }
    }).catch(() => {});
  }).catch(() => {});
}

export function useSettings() {
  const applyTheme = (theme: Theme) => {
    setSettings((prev) => {
      const next = { ...prev, theme };
      broadcastSettings(next);
      return next;
    });
    applyDomTheme(theme, settings().colorMode, settings().customThemes);
  };

  const updateSettings = (partial: Partial<SettingsState>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      applyDomTheme(next.theme, next.colorMode, next.customThemes);
      broadcastSettings(next);
      return next;
    });
  };

  const cycleColorMode = () => {
    const current = settings().colorMode || "dark";
    const order: ColorMode[] = ["dark", "light", "auto"];
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    updateSettings({ colorMode: order[nextIdx] });
  };

  const t = (key: TranslationKey): string => {
    const lang = settings().language;
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return {
    settings,
    updateSettings,
    applyTheme,
    cycleColorMode,
    t,
  };
}
