import { createSignal, onMount, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { DownloadTask } from "./features/downloads/types";
import { useSettings } from "./shared/stores/settingsStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { DownloadFileInfoModal } from "./features/downloads/components/DownloadFileInfoModal";
import { DownloadProgressModal } from "./features/downloads/components/DownloadProgressModal";
import { DownloadCompleteModal } from "./features/downloads/components/DownloadCompleteModal";
import { SettingsModal } from "./features/settings/components/SettingsModal";
import { UpdateModal } from "./features/settings/components/UpdateModal";
import { CustomTrayMenu } from "./features/tray/components/CustomTrayMenu";
const LazyApp = lazy(() => import("./App"));

function RootRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const taskId = params.get("task_id");
  const initialUrl = params.get("initial_url") || undefined;
  const audioUrl = params.get("audio_url") || undefined;
  const suggestedFilename = params.get("suggested_filename") || undefined;

  const { settings, applyTheme } = useSettings();

  applyTheme(settings().theme);

  const revealWindowWhenReady = async (title?: string) => {
    try {
      const win = getCurrentWindow();
      if (title) {
        await win.setTitle(title);
      }
      await win.unminimize();
      await win.show();
      await win.setAlwaysOnTop(true);
      await win.setFocus();
      setTimeout(async () => {
        try {
          await win.setAlwaysOnTop(false);
          await win.setFocus();
        } catch {}
      }, 200);
    } catch {
      if (title) document.title = title;
    }
  };

  const closeCurrentWindow = async () => {
    try {
      const win = getCurrentWindow();
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_aux_window", { label: win.label });
    } catch {
      try {
        const win = getCurrentWindow();
        await win.close();
      } catch {
        window.close();
      }
    }
  };

  if (view === "file-info") {
    onMount(() => {
      revealWindowWhenReady("DOWNLOAD FILE INFO");
    });

    return (
      <div class="h-screen w-screen bg-[var(--bg-primary)] p-0 m-0 overflow-hidden select-none border border-[var(--border)]">
        <DownloadFileInfoModal
          isOpen={true}
          isStandaloneWindow={true}
          initialUrl={initialUrl}
          audioUrl={audioUrl}
          suggestedFilename={suggestedFilename}
          onClose={closeCurrentWindow}
          onStartDownload={async (task) => {
            const { invoke } = await import("@tauri-apps/api/core");
            try {
              await invoke("open_aux_window", {
                windowType: "progress",
                taskId: task.id,
                initialUrl: null,
                audioUrl: null,
                suggestedFilename: null,
              });
            } catch (err) {
              console.error("Failed to open progress window:", err);
            }
            await closeCurrentWindow();
          }}
          onDownloadLater={async () => {
            await closeCurrentWindow();
          }}
        />
      </div>
    );
  }

  if (view === "progress") {
    const [task, setTask] = createSignal<DownloadTask | null>(null);

    onMount(async () => {
      revealWindowWhenReady("Connecting...");

      if (taskId) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const realTask = await invoke<DownloadTask | null>("get_task", { taskId });
          if (realTask) {
            setTask(realTask);
            revealWindowWhenReady(realTask.filename);
          }
        } catch {}

        try {
          const { listen } = await import("@tauri-apps/api/event");
          listen<import("./features/downloads/types").DownloadProgressPayload>("download-progress", (event) => {
            if (event.payload.task_id === taskId) {
              setTask((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  downloaded_bytes: event.payload.downloaded_bytes,
                  total_bytes: event.payload.total_bytes,
                  speed_bytes_sec: event.payload.speed_bytes_sec,
                  eta_seconds: event.payload.eta_seconds,
                  status: event.payload.status,
                  chunks: event.payload.chunks,
                };
              });
            }
          });

          listen<DownloadTask>("download-complete", async (event) => {
            if (event.payload.id === taskId) {
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("open_aux_window", {
                  windowType: "complete",
                  taskId: event.payload.id,
                  initialUrl: null,
                  audioUrl: null,
                  suggestedFilename: null,
                });
              } catch (err) {
                console.error("Failed to open complete window:", err);
              }
              await closeCurrentWindow();
            }
          });
        } catch {}
      }
    });

    const handlePauseResume = async () => {
      const current = task();
      if (!current) return;
      const willPause = current.status === "Downloading";
      setTask({
        ...current,
        status: willPause ? "Paused" : "Downloading",
        speed_bytes_sec: willPause ? 0 : current.speed_bytes_sec,
      });

      const { invoke } = await import("@tauri-apps/api/core");
      try {
        if (willPause) {
          await invoke("pause_download", { taskId: current.id });
        } else {
          await invoke("start_download", { taskId: current.id });
        }
      } catch (err) {
        console.error("Error toggle pause/resume:", err);
      }
    };

    const handleCancel = async () => {
      const current = task();
      if (current) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_task", { taskId: current.id, deleteFile: true });
      }
      closeCurrentWindow();
    };

    return (
      <div class="h-screen w-screen bg-[var(--bg-primary)] p-0 m-0 overflow-hidden select-none border border-[var(--border)]">
        <DownloadProgressModal
          isOpen={true}
          isStandaloneWindow={true}
          task={task()}
          onClose={closeCurrentWindow}
          onPauseResume={handlePauseResume}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (view === "complete") {
    const [task, setTask] = createSignal<DownloadTask | null>(null);

    onMount(async () => {
      revealWindowWhenReady("DOWNLOAD COMPLETE");

      if (taskId) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const realTask = await invoke<DownloadTask | null>("get_task", { taskId });
          if (realTask) {
            setTask(realTask);
            revealWindowWhenReady(`DOWNLOAD COMPLETE — ${realTask.filename}`);
          }
        } catch {}
      }
    });

    return (
      <div class="h-screen w-screen bg-[var(--bg-primary)] p-0 m-0 overflow-hidden select-none border border-[var(--border)]">
        <DownloadCompleteModal
          isOpen={true}
          isStandaloneWindow={true}
          task={task()}
          onClose={closeCurrentWindow}
        />
      </div>
    );
  }

  if (view === "settings") {
    onMount(() => {
      revealWindowWhenReady("OPTIONS — ULTRA-DOWNLOADER");
    });

    return (
      <div class="h-screen w-screen bg-[var(--bg-primary)] p-0 m-0 overflow-hidden select-none border border-[var(--border)]">
        <SettingsModal
          isOpen={true}
          isStandaloneWindow={true}
          onClose={closeCurrentWindow}
        />
      </div>
    );
  }

  if (view === "updater") {
    onMount(() => {
      revealWindowWhenReady("UPDATER");
    });

    return (
      <div class="h-screen w-screen bg-[var(--bg-primary)] p-0 m-0 overflow-hidden select-none border border-[var(--border)]">
        <UpdateModal
          isOpen={true}
          isStandaloneWindow={true}
          onClose={closeCurrentWindow}
        />
      </div>
    );
  }

  if (view === "tray-menu") {
    onMount(() => {
      revealWindowWhenReady("Ultra Tray Menu");
    });

    return (
      <div class="h-screen w-screen bg-[var(--bg-secondary)] p-0 m-0 overflow-hidden select-none">
        <CustomTrayMenu />
      </div>
    );
  }

  return (
    <Suspense fallback={<div class="h-screen w-screen bg-[var(--bg-primary)]" />}>
      <LazyApp />
    </Suspense>
  );
}

render(() => <RootRouter />, document.getElementById("root") as HTMLElement);
