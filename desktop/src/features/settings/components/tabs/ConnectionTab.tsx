import { useSettings } from "../../../../shared/stores/settingsStore";
import { ConnectionSpeedType } from "../../types";

export function ConnectionTab() {
  const { settings, updateSettings, t } = useSettings();

  return (
    <div class="space-y-4">
      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-3">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("dynamic_segmentation")}
        </span>
        <div class="space-y-2">
          <div class="flex justify-between items-center font-bold text-[11px]">
            <span>{t("max_connections")}:</span>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] font-mono font-bold text-xs tracking-wider">
                {settings().maxConnectionsNumber} SOCKETS
              </span>
            </div>
          </div>

          <div class="relative py-1">
            <input
              type="range"
              min="1"
              max="32"
              value={settings().maxConnectionsNumber}
              onInput={(e) => updateSettings({ maxConnectionsNumber: parseInt(e.currentTarget.value) })}
              class="udm-range-slider block"
              style={{
                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((settings().maxConnectionsNumber - 1) / 31) * 100}%, var(--bg-surface) ${((settings().maxConnectionsNumber - 1) / 31) * 100}%, var(--bg-surface) 100%)`
              }}
            />
          </div>

          <div class="flex justify-between text-[9px] font-mono text-[var(--text-muted)] px-0.5">
            <button
              type="button"
              onClick={() => updateSettings({ maxConnectionsNumber: 1 })}
              class="hover:text-[var(--accent)] transition cursor-pointer"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ maxConnectionsNumber: 8 })}
              class="hover:text-[var(--accent)] transition cursor-pointer"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ maxConnectionsNumber: 16 })}
              class="hover:text-[var(--accent)] transition cursor-pointer"
            >
              16
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ maxConnectionsNumber: 24 })}
              class="hover:text-[var(--accent)] transition cursor-pointer"
            >
              24
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ maxConnectionsNumber: 32 })}
              class="hover:text-[var(--accent)] transition cursor-pointer"
            >
              32 (MAX)
            </button>
          </div>
        </div>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-3">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("network_type")}
        </span>
        <div class="grid grid-cols-2 gap-2 text-[10px]">
          {(["low", "medium", "high", "lan_turbo"] as ConnectionSpeedType[]).map((type) => (
            <button
              onClick={() => updateSettings({ connectionType: type })}
              class={`p-2 border text-left font-bold transition cursor-pointer ${
                settings().connectionType === type
                  ? "bg-[var(--bg-primary)] border-[var(--accent)] text-[var(--accent)] shadow-sm"
                  : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              <div class="uppercase tracking-wider">{type.replace("_", " ")}</div>
            </button>
          ))}
        </div>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("speed_limiter")}
        </span>
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="speedLimitCheck"
            checked={settings().speedLimitEnabled}
            onChange={(e) => updateSettings({ speedLimitEnabled: e.currentTarget.checked })}
            class="accent-[var(--accent)]"
          />
          <label for="speedLimitCheck" class="text-[11px] font-bold">{t("enable_speed_limiter")}</label>
        </div>
        {settings().speedLimitEnabled && (
          <div class="flex items-center gap-2 pt-1">
            <input
              type="number"
              value={Math.floor(settings().speedLimitBytesSec / 1024)}
              onInput={(e) => updateSettings({ speedLimitBytesSec: (parseInt(e.currentTarget.value) || 1024) * 1024 })}
              class="w-32 bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--accent)] font-mono font-bold"
            />
            <span class="text-[10px] text-[var(--text-muted)]">{t("kb_per_sec")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
