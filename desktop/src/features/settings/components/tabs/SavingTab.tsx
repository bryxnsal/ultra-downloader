import { useSettings } from "../../../../shared/stores/settingsStore";

export function SavingTab() {
  const { settings, updateSettings, t } = useSettings();

  return (
    <div class="space-y-4">
      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("dest_folder")}
        </span>
        <div class="flex gap-2">
          <input
            type="text"
            value={settings().saveToDefault}
            onInput={(e) => updateSettings({ saveToDefault: e.currentTarget.value })}
            class="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={async () => {
              const { invoke } = await import("@tauri-apps/api/core");
              const res = await invoke<string | null>("pick_folder", { defaultPath: settings().saveToDefault });
              if (res) updateSettings({ saveToDefault: res });
            }}
            class="border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] text-[10px] cursor-pointer uppercase"
          >
            {t("browse")}
          </button>
        </div>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("temp_folder")}
        </span>
        <div class="flex gap-2">
          <input
            type="text"
            value={settings().tempPath}
            onInput={(e) => updateSettings({ tempPath: e.currentTarget.value })}
            class="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={async () => {
              const { invoke } = await import("@tauri-apps/api/core");
              const res = await invoke<string | null>("pick_folder", { defaultPath: settings().tempPath });
              if (res) updateSettings({ tempPath: res });
            }}
            class="border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] text-[10px] cursor-pointer uppercase"
          >
            {t("browse")}
          </button>
        </div>
      </div>
    </div>
  );
}
