import { useSettings } from "../../../../shared/stores/settingsStore";

export function FileTypesTab() {
  const { settings, updateSettings, t } = useSettings();

  return (
    <div class="space-y-4">
      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("auto_extensions")}
        </span>
        <textarea
          rows="3"
          value={settings().interceptExtensions}
          onInput={(e) => updateSettings({ interceptExtensions: e.currentTarget.value })}
          class="w-full bg-[var(--bg-surface)] border border-[var(--border)] p-2 text-[10px] font-mono text-[var(--text-main)] focus:outline-none"
        ></textarea>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("excluded_domains")}
        </span>
        <textarea
          rows="2"
          value={settings().exceptionServers}
          onInput={(e) => updateSettings({ exceptionServers: e.currentTarget.value })}
          class="w-full bg-[var(--bg-surface)] border border-[var(--border)] p-2 text-[10px] font-mono text-[var(--text-main)] focus:outline-none"
        ></textarea>
      </div>
    </div>
  );
}
