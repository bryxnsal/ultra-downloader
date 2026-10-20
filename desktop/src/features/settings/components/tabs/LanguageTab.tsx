import { useSettings } from "../../../../shared/stores/settingsStore";

export function LanguageTab() {
  const { settings, updateSettings, t } = useSettings();

  return (
    <div class="space-y-4">
      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-3">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("language_select")}
        </span>
        <div class="grid grid-cols-2 gap-3">
          <button
            onClick={() => updateSettings({ language: "en" })}
            class={`p-3 border text-left font-bold transition flex items-center justify-between ${
              settings().language === "en"
                ? "bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <div>
              <div class="text-xs uppercase">{t("lang_en")}</div>
              <div class="text-[9px] font-normal text-[var(--text-muted)] mt-0.5">English (Default)</div>
            </div>
            {settings().language === "en" && <div class="w-2.5 h-2.5 bg-[var(--accent)]"></div>}
          </button>

          <button
            onClick={() => updateSettings({ language: "es" })}
            class={`p-3 border text-left font-bold transition flex items-center justify-between ${
              settings().language === "es"
                ? "bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <div>
              <div class="text-xs uppercase">{t("lang_es")}</div>
              <div class="text-[9px] font-normal text-[var(--text-muted)] mt-0.5">Español</div>
            </div>
            {settings().language === "es" && <div class="w-2.5 h-2.5 bg-[var(--accent)]"></div>}
          </button>
        </div>
      </div>
    </div>
  );
}
