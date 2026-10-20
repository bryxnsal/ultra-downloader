import { createSignal } from "solid-js";
import { useSettings } from "../../../shared/stores/settingsStore";
import { WindowControls } from "../../../shared/components/WindowControls";

interface ExcludeDomainModalProps {
  initialUrl?: string;
  domain?: string;
  onClose: () => void;
}

export function ExcludeDomainModal(props: ExcludeDomainModalProps) {
  const { settings, updateSettings, t } = useSettings();

  const getDomainCandidates = () => {
    let hostname = "";
    if (props.domain) {
      hostname = props.domain;
    } else if (props.initialUrl) {
      try {
        hostname = new URL(props.initialUrl).hostname;
      } catch {
        hostname = props.initialUrl.split("/")[0];
      }
    }

    hostname = hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".");
    let rootDomain = hostname;
    if (parts.length > 2) {
      rootDomain = parts.slice(-2).join(".");
    }

    return {
      specificDomain: hostname || "domain.com",
      wildcardDomain: `*.${rootDomain || "domain.com"}`,
    };
  };

  const candidates = getDomainCandidates();
  const [selectedOption, setSelectedOption] = createSignal<string>(candidates.wildcardDomain);

  const handleAdd = () => {
    const chosen = selectedOption().trim();
    if (!chosen) {
      props.onClose();
      return;
    }

    const currentList = settings().exceptionServers
      ? settings().exceptionServers.split(/[\s,;|]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [];

    if (!currentList.includes(chosen.toLowerCase())) {
      currentList.push(chosen.toLowerCase());
      updateSettings({ exceptionServers: currentList.join(" ") });
    }

    props.onClose();
  };

  return (
    <div class="w-full h-full bg-[var(--bg-primary)] flex flex-col justify-between text-[12px] select-none relative font-mono">
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-white"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] uppercase">
            {t("exclude_site_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={true} />
      </div>

      <div class="p-3.5 space-y-3 flex-1 overflow-y-auto">
        <p class="text-[11px] text-[var(--text-main)] leading-relaxed">
          {t("exclude_site_desc")}
        </p>

        <div class="space-y-2 border border-[var(--border)] bg-[var(--bg-surface)] p-2.5">
          <label class="flex items-center gap-2.5 cursor-pointer text-[11px] text-[var(--text-main)] hover:text-[var(--accent)]">
            <input
              type="checkbox"
              checked={selectedOption() === candidates.specificDomain}
              onChange={() => setSelectedOption(candidates.specificDomain)}
              class="w-3.5 h-3.5 rounded-none border-[var(--border)] bg-[var(--bg-primary)] accent-[var(--accent)] cursor-pointer"
            />
            <span class="font-bold font-mono">{candidates.specificDomain}</span>
            <span class="text-[9px] text-[var(--text-muted)] font-normal">({t("exclude_exact_domain")})</span>
          </label>

          <label class="flex items-center gap-2.5 cursor-pointer text-[11px] text-[var(--text-main)] hover:text-[var(--accent)]">
            <input
              type="checkbox"
              checked={selectedOption() === candidates.wildcardDomain}
              onChange={() => setSelectedOption(candidates.wildcardDomain)}
              class="w-3.5 h-3.5 rounded-none border-[var(--border)] bg-[var(--bg-primary)] accent-[var(--accent)] cursor-pointer"
            />
            <span class="font-bold font-mono">{candidates.wildcardDomain}</span>
            <span class="text-[9px] text-[var(--text-muted)] font-normal">({t("exclude_all_subdomains")})</span>
          </label>
        </div>
      </div>

      <div class="border-t border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2 flex items-center justify-end gap-2 shrink-0">
        <button
          onClick={handleAdd}
          class="border border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-primary)] px-4 py-1 font-bold hover:brightness-110 cursor-pointer uppercase tracking-wider text-[11px] shadow-sm transition-all"
        >
          {t("add")}
        </button>
        <button
          onClick={props.onClose}
          class="border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1 font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer uppercase tracking-wider text-[11px] transition-colors"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
