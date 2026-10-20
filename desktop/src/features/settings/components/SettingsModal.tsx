import { createSignal, For, Show } from "solid-js";
import { useSettings } from "../../../shared/stores/settingsStore";
import { WindowControls } from "../../../shared/components/WindowControls";
import { ConnectionTab } from "./tabs/ConnectionTab";
import { ThemeTab } from "./tabs/ThemeTab";
import { LanguageTab } from "./tabs/LanguageTab";
import { SavingTab } from "./tabs/SavingTab";
import { FileTypesTab } from "./tabs/FileTypesTab";
import { GeneralTab } from "./tabs/GeneralTab";

interface SettingsModalProps {
  isOpen: boolean;
  isStandaloneWindow?: boolean;
  onClose: () => void;
}

type TabKey = "connection" | "theme" | "language" | "saving" | "file_types" | "general";

export function SettingsModal(props: SettingsModalProps) {
  const { t } = useSettings();
  const [activeTab, setActiveTab] = createSignal<TabKey>("connection");

  const tabs: { key: TabKey; labelKey: any }[] = [
    { key: "connection", labelKey: "tab_connection" },
    { key: "theme", labelKey: "tab_theme" },
    { key: "language", labelKey: "tab_language" },
    { key: "saving", labelKey: "tab_saving" },
    { key: "file_types", labelKey: "tab_file_types" },
    { key: "general", labelKey: "tab_general" },
  ];

  const content = (
    <div
      class={
        props.isStandaloneWindow
          ? "w-full h-full bg-[var(--bg-surface)] flex flex-col select-none overflow-hidden"
          : "bg-[var(--bg-surface)] border-2 border-[var(--border)] w-full max-w-2xl h-[520px] flex flex-col shadow-2xl"
      }
    >
      <div
        data-tauri-drag-region
        class="h-8 pl-3 pr-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between select-none shrink-0 cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-white"></span>
          <span class="font-bold tracking-wider text-[var(--text-main)] text-[11px] uppercase">
            {t("settings_title")}
          </span>
        </div>
        <WindowControls onClose={props.onClose} hideMaximize={true} />
      </div>

      <div class="flex bg-[var(--bg-primary)] border-b border-[var(--border)] overflow-x-auto text-[10px] font-bold shrink-0">
        <For each={tabs}>
          {(tab) => (
            <button
              onClick={() => setActiveTab(tab.key)}
              class={`px-4 py-2 border-r border-[var(--border)] transition-colors whitespace-nowrap ${
                activeTab() === tab.key
                  ? "bg-[var(--bg-primary)] text-[var(--accent)] border-b-2 border-b-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          )}
        </For>
      </div>

      <div class="flex-1 p-5 overflow-y-auto space-y-4 text-[11px] bg-[var(--bg-primary)]">
        {activeTab() === "connection" && <ConnectionTab />}
        {activeTab() === "theme" && <ThemeTab />}
        {activeTab() === "language" && <LanguageTab />}
        {activeTab() === "saving" && <SavingTab />}
        {activeTab() === "file_types" && <FileTypesTab />}
        {activeTab() === "general" && <GeneralTab />}
      </div>

      <div class="h-11 px-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-end gap-2 shrink-0">
        <button
          onClick={() => {
            props.onClose();
          }}
          class="px-4 py-1.5 bg-[var(--accent)] border border-[var(--accent)] text-[var(--bg-primary)] font-bold text-[11px] hover:opacity-90 active:translate-y-[1px] cursor-pointer"
        >
          {t("save_close")}
        </button>
      </div>
    </div>
  );

  return (
    <Show when={props.isOpen}>
      {props.isStandaloneWindow ? (
        content
      ) : (
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 select-none">
          {content}
        </div>
      )}
    </Show>
  );
}
