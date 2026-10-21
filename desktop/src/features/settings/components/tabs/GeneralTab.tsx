import { createSignal } from "solid-js";
import { setAutostartEnabled, useSettings } from "../../../../shared/stores/settingsStore";

export function GeneralTab() {
  const { settings, updateSettings, t } = useSettings();
  const [autostartBusy, setAutostartBusy] = createSignal(false);
  const [autostartError, setAutostartError] = createSignal<string | null>(null);

  const handleAutostartChange = async (enabled: boolean) => {
    if (autostartBusy()) return;
    setAutostartBusy(true);
    setAutostartError(null);
    try {
      await setAutostartEnabled(enabled);
    } catch (error) {
      setAutostartError(error instanceof Error ? error.message : String(error));
    } finally {
      setAutostartBusy(false);
    }
  };

  return (
    <div class="space-y-4">
      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-[var(--accent)] block text-[10px]">
            {t("browser_integration_title")}
          </span>
          <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40">
            {t("bridge_online")}
          </span>
        </div>
        <p class="text-[9px] text-[var(--text-muted)]">
          {t("browser_integration_desc")}
        </p>
        <div class="flex items-center justify-between pt-1 border-t border-[var(--border)]/50 text-[10px] font-mono">
          <span class="text-[var(--text-muted)]">{t("bridge_endpoint")}:</span>
          <span class="text-[var(--accent)] font-bold">127.0.0.1:51248</span>
        </div>
        <div class="pt-2 border-t border-[var(--border)]/50 flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-[10px] font-bold text-[var(--text-main)]">{t("install_browser_extension")}</span>
            <span class="text-[9px] text-[var(--text-muted)]">{t("install_browser_extension_desc")}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              import("@tauri-apps/api/core").then(({ invoke }) => {
                invoke<string>("get_extension_path").then((extPath) => {
                  import("@tauri-apps/plugin-opener").then(({ revealItemInDir }) => {
                    revealItemInDir(extPath).catch(() => {});
                  }).catch(() => {});
                }).catch(() => {});
              }).catch(() => {});
            }}
            class="px-2.5 py-1 text-[10px] font-bold uppercase border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition cursor-pointer"
          >
            {t("open_extension_folder")}
          </button>
        </div>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("autostart_system_title")}
        </span>
        <p class="text-[9px] text-[var(--text-muted)]">
          {t("autostart_system_desc")}
        </p>
        <label class={`flex items-center gap-2 pt-1 ${autostartBusy() ? "opacity-60 cursor-wait" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={settings().autostartEnabled}
            disabled={autostartBusy()}
            onChange={(e) => void handleAutostartChange(e.currentTarget.checked)}
            class="accent-[var(--accent)]"
          />
          <span class="text-[10px] text-[var(--text-main)] font-mono">{t("autostart_system_label")}</span>
        </label>
        {autostartError() && (
          <p class="text-[9px] text-red-400 font-mono break-words">{autostartError()}</p>
        )}
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("ffmpeg_configuration")}
        </span>
        <p class="text-[9px] text-[var(--text-muted)]">
          {t("ffmpeg_desc")}
        </p>
        <div class="space-y-1 pt-1">
          <label class="text-[9px] text-[var(--text-muted)]">{t("ffmpeg_custom_path")}:</label>
          <input
            type="text"
            placeholder="ffmpeg (Default from PATH)"
            value={settings().ffmpegPath || ""}
            onInput={(e) => updateSettings({ ffmpegPath: e.currentTarget.value })}
            class="w-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-1 text-[10px] font-mono"
          />
        </div>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("antivirus_scan")}
        </span>
        <label class="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={settings().virusScanEnabled}
            onChange={(e) => updateSettings({ virusScanEnabled: e.currentTarget.checked })}
            class="accent-[var(--accent)]"
          />
          <span>{t("enable_antivirus")}</span>
        </label>
        {settings().virusScanEnabled && (
          <div class="space-y-1">
            <label class="text-[9px] text-[var(--text-muted)]">{t("antivirus_cmd")}:</label>
            <input
              type="text"
              value={settings().virusScanCmd}
              onInput={(e) => updateSettings({ virusScanCmd: e.currentTarget.value })}
              class="w-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-1 text-[10px] font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
}
