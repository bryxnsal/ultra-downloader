import { createSignal, onMount } from "solid-js";
import { useSettings } from "../../../../shared/stores/settingsStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Terminal, Globe } from "lucide-solid";

interface AboutTabProps {
  onCheckUpdates: () => void;
}

export function AboutTab(props: AboutTabProps) {
  const { t } = useSettings();
  const [platformInfo, setPlatformInfo] = createSignal<string>("Detecting...");

  onMount(() => {
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Windows")) {
      setPlatformInfo("Windows NT (x86_64 / MSVC)");
    } else if (userAgent.includes("Macintosh")) {
      setPlatformInfo("macOS Darwin (Universal)");
    } else if (userAgent.includes("Linux")) {
      setPlatformInfo("Linux Desktop (x86_64)");
    } else {
      setPlatformInfo("Cross-Platform Desktop");
    }
  });

  const openGithub = async () => {
    try {
      await openUrl("https://github.com/bryxnsal/ultra-downloader");
    } catch {
      window.open("https://github.com/bryxnsal/ultra-downloader", "_blank");
    }
  };

  const openIssues = async () => {
    try {
      await openUrl("https://github.com/bryxnsal/ultra-downloader/issues");
    } catch {
      window.open("https://github.com/bryxnsal/ultra-downloader/issues", "_blank");
    }
  };

  return (
    <div class="space-y-4">
      <div class="p-3.5 border border-[var(--border)] bg-[var(--bg-primary)] flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-white flex items-center justify-center shrink-0"></div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-[12px] text-[var(--text-main)] uppercase tracking-wider">
                Ultra Downloader
              </h3>
              <span class="px-1.5 py-0.5 bg-[var(--accent)] text-[var(--bg-primary)] font-mono font-bold text-[9px]">
                v0.2.3
              </span>
            </div>
            <p class="text-[10px] text-[var(--text-muted)]">
              High-Speed Dynamic Multi-Socket Download Engine
            </p>
          </div>
        </div>

        <button
          onClick={props.onCheckUpdates}
          class="px-3 py-1.5 bg-[var(--accent)] border border-[var(--accent)] text-[var(--bg-primary)] font-bold text-[10px] uppercase hover:opacity-90 active:translate-y-[1px] cursor-pointer shrink-0"
        >
          {t("check_updates_btn")}
        </button>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px] uppercase tracking-wider">
          {t("system_runtime_info")}
        </span>

        <div class="p-2.5 bg-[var(--bg-surface)] border border-[var(--border)] divide-y divide-[var(--border)] text-[10px] font-mono">
          <div class="py-1.5 flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Operating System:</span>
            <span class="text-[var(--text-main)] font-bold">{platformInfo()}</span>
          </div>
          <div class="py-1.5 flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Architecture & Core:</span>
            <span class="text-[var(--text-main)] font-bold">Rust / Tokio (Tauri v2)</span>
          </div>
          <div class="py-1.5 flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Deep Link Protocol:</span>
            <span class="text-[var(--accent)] font-bold">udm:// (Active)</span>
          </div>
          <div class="py-1.5 flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Local Bridge Server:</span>
            <span class="text-[var(--text-main)] font-bold">127.0.0.1:51248</span>
          </div>
          <div class="py-1.5 flex justify-between items-center">
            <span class="text-[var(--text-muted)]">License & Publisher:</span>
            <span class="text-[var(--text-main)]">GPL-3.0 © 2026 Brayan Salazar</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5 pt-0.5">
        <button
          onClick={openGithub}
          class="p-2.5 border border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-main)] flex items-center justify-between text-[10px] font-bold uppercase transition cursor-pointer"
        >
          <span class="flex items-center gap-2">
            <Globe class="w-3.5 h-3.5 text-[var(--accent)]" />
            GitHub Repository
          </span>
          <ExternalLink class="w-3 h-3 text-[var(--text-muted)]" />
        </button>

        <button
          onClick={openIssues}
          class="p-2.5 border border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-main)] flex items-center justify-between text-[10px] font-bold uppercase transition cursor-pointer"
        >
          <span class="flex items-center gap-2">
            <Terminal class="w-3.5 h-3.5 text-[var(--accent)]" />
            Report Issue / Bug
          </span>
          <ExternalLink class="w-3 h-3 text-[var(--text-muted)]" />
        </button>
      </div>
    </div>
  );
}
