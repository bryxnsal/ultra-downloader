import { Show, createSignal, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-solid";

interface WindowControlsProps {
  onClose?: () => void;
  hideMaximize?: boolean;
}

export function WindowControls(props: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = createSignal(false);

  onMount(async () => {
    try {
      const win = getCurrentWindow();
      setIsMaximized(await win.isMaximized());
      await win.onResized(async () => {
        setIsMaximized(await win.isMaximized());
      });
    } catch {}
  });

  const handleMinimize = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_minimize");
    } catch {
      try {
        const win = getCurrentWindow();
        await win.minimize();
      } catch {}
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_toggle_maximize");
      setIsMaximized(!isMaximized());
    } catch {
      try {
        const win = getCurrentWindow();
        await win.toggleMaximize();
        setIsMaximized(await win.isMaximized());
      } catch {}
    }
  };

  const handleClose = async () => {
    if (props.onClose) {
      props.onClose();
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_close");
    } catch {
      try {
        const win = getCurrentWindow();
        await win.close();
      } catch {
        window.close();
      }
    }
  };

  return (
    <div class="flex items-center h-full no-drag">
      <button
        onClick={handleMinimize}
        class="h-full px-2.5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
        title="Minimizar"
      >
        <Minus size={13} strokeWidth={2.5} />
      </button>

      <Show when={!props.hideMaximize}>
        <button
          onClick={handleToggleMaximize}
          class="h-full px-2.5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          title={isMaximized() ? "Restaurar" : "Maximizar"}
        >
          {isMaximized() ? (
            <Copy size={11} strokeWidth={2.2} class="rotate-180" />
          ) : (
            <Square size={11} strokeWidth={2.2} />
          )}
        </button>
      </Show>

      <button
        onClick={handleClose}
        class="h-full px-3 flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-red-600 transition-colors cursor-pointer"
        title="Cerrar"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
