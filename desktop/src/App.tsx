import { createSignal, onMount } from "solid-js";
import { DownloadTask } from "./features/downloads/types";
import { DownloadsTable } from "./features/downloads/components/DownloadsTable";
import { ChunksInspector } from "./features/chunks-inspector/components/ChunksInspector";
import { useSettings } from "./shared/stores/settingsStore";
import { formatBytes } from "./shared/utils";
import { WindowControls } from "./shared/components/WindowControls";
import { IconThemeDark, IconThemeLight, IconThemeAuto } from "./shared/components/ThemeIcons";
import "./App.css";

export default function App() {
  const { settings, applyTheme, cycleColorMode, t } = useSettings();
  
  const [tasks, setTasks] = createSignal<DownloadTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = createSignal<string | null>(null);

  onMount(() => {
    applyTheme(settings().theme);

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("tray-add-download", () => {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("open_aux_window", {
            windowType: "file-info",
            taskId: null,
            initialUrl: null,
            audioUrl: null,
            suggestedFilename: null,
          }).catch(() => {
            setShowFileInfoModal(true);
          });
        }).catch(() => setShowFileInfoModal(true));
      });

      listen("tray-open-options", () => {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("open_aux_window", {
            windowType: "settings",
            taskId: null,
            initialUrl: null,
            audioUrl: null,
            suggestedFilename: null,
          }).catch(() => {
            setShowSettingsModal(true);
          });
        }).catch(() => setShowSettingsModal(true));
      });

      listen("tray-pause-all", () => {
        setTasks(
          tasks().map((t) => (t.status === "Downloading" ? { ...t, status: "Paused" as const } : t))
        );
      });

      listen("tray-stop-all", () => {
        setTasks(
          tasks().map((t) => (t.status === "Downloading" ? { ...t, status: "Queued" as const, speed_bytes_sec: 0 } : t))
        );
      });

      listen<boolean>("tray-limiter-toggle", (event) => {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("set_speed_limiter", { enabled: event.payload, speedKbSec: 2048 }).catch(() => {});
        }).catch(() => {});
      });

      listen<{ url: string; audio_url?: string | null; filename?: string; cookies?: string; referer?: string }>("browser-download-intercepted", () => {
      });

      listen<DownloadTask>("task-created", (event) => {
        const newTask = event.payload;
        setTasks((prev) => {
          if (prev.some((t) => t.id === newTask.id)) {
            return prev.map((t) => (t.id === newTask.id ? newTask : t));
          }
          return [newTask, ...prev];
        });
        if (!selectedTaskId()) {
          setSelectedTaskId(newTask.id);
        }
      });

      listen<import("./features/downloads/types").DownloadProgressPayload>("download-progress", (event) => {
        const payload = event.payload;
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === payload.task_id);
          if (!exists) {
            import("@tauri-apps/api/core").then(({ invoke }) => {
              invoke<DownloadTask | null>("get_task", { taskId: payload.task_id }).then((fetchedTask) => {
                if (fetchedTask) {
                  setTasks((curr) => {
                    if (curr.some((t) => t.id === fetchedTask.id)) return curr;
                    return [fetchedTask, ...curr];
                  });
                }
              }).catch(() => {});
            }).catch(() => {});
            return prev;
          }

          return prev.map((t) =>
            t.id === payload.task_id
              ? {
                  ...t,
                  downloaded_bytes: payload.downloaded_bytes,
                  total_bytes: payload.total_bytes,
                  speed_bytes_sec: payload.speed_bytes_sec,
                  eta_seconds: payload.eta_seconds,
                  status: payload.status,
                  chunks: payload.chunks,
                }
              : t
          );
        });
      });

      listen<DownloadTask>("download-complete", (event) => {
        const completedTask = event.payload;
        setTasks((prev) =>
          prev.map((t) => (t.id === completedTask.id ? completedTask : t))
        );
        setCompletedTaskId(completedTask.id);
        setShowProgressModal(false);

        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("open_aux_window", {
            windowType: "complete",
            taskId: completedTask.id,
            initialUrl: null,
            audioUrl: null,
            suggestedFilename: null,
          }).catch(() => {
            setShowCompleteModal(true);
          });
        }).catch(() => setShowCompleteModal(true));
      });
    }).catch(() => {});

    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<DownloadTask[]>("get_tasks").then((loadedTasks) => {
        if (loadedTasks && loadedTasks.length > 0) {
          setTasks(loadedTasks);
        }
      }).catch(() => {});
    }).catch(() => {});
  });

  const selectedTask = () => (selectedTaskId() ? tasks().find((t) => t.id === selectedTaskId()) || null : null);

  const totalSpeed = () => {
    return tasks().reduce((acc, t) => (t.status === "Downloading" ? acc + t.speed_bytes_sec : acc), 0);
  };

  const handlePauseResume = async (taskId: string) => {
    const task = tasks().find((t) => t.id === taskId);
    if (!task) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (task.status === "Downloading") {
        await invoke("pause_download", { taskId });
        setTasks(
          tasks().map((t) =>
            t.id === taskId ? { ...t, status: "Paused" as const, speed_bytes_sec: 0 } : t
          )
        );
      } else {
        await invoke("start_download", { taskId });
        setTasks(
          tasks().map((t) =>
            t.id === taskId ? { ...t, status: "Downloading" as const } : t
          )
        );
      }
    } catch {
      setTasks(
        tasks().map((t) =>
          t.id === taskId
            ? { ...t, status: t.status === "Downloading" ? "Paused" : "Downloading" }
            : t
        )
      );
    }
  };

  const handleCancelTask = async (taskId: string, deleteFile: boolean = true) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_task", { taskId, deleteFile });
    } catch {}
    setTasks(tasks().filter((t) => t.id !== taskId));
    if (selectedTaskId() === taskId) {
      setSelectedTaskId(null);
    }
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      class="flex flex-col h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-main)] font-mono text-[12px] select-none border border-[var(--border)]"
    >
      
      <header
        data-tauri-drag-region
        class="h-10 pl-3 pr-0 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center justify-between select-none"
      >
        <div data-tauri-drag-region class="flex items-center gap-3 flex-1 h-full cursor-default">
          <div data-tauri-drag-region class="flex items-center gap-1.5 font-bold tracking-wider text-[var(--accent)]">
            <span class="inline-block w-2.5 h-2.5 bg-white"></span>
            <span class="text-[10px] text-[var(--text-muted)] font-normal">{t("app_subtitle")}</span>
          </div>
          <span class="text-[var(--border)]">|</span>
          <div data-tauri-drag-region class="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <span>{t("speed")}:</span>
            <span class="text-[var(--accent)] font-bold">{formatBytes(totalSpeed())}/s</span>
          </div>
          <span class="text-[var(--border)]">|</span>
          <div data-tauri-drag-region class="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <span>{t("sockets")}:</span>
            <span class="text-[var(--accent)] font-bold">{settings().maxConnectionsNumber}</span>
          </div>
        </div>

        <div class="flex items-center h-full">
          <div class="flex items-center gap-3 mr-3">
            <button
              onClick={() => {
                import("@tauri-apps/api/core").then(({ invoke }) => {
                  invoke("open_aux_window", {
                    windowType: "file-info",
                    taskId: null,
                    initialUrl: null,
                    audioUrl: null,
                    suggestedFilename: null,
                  }).catch(() => {});
                }).catch(() => {});
              }}
              class="px-2.5 py-1 bg-[var(--accent)] text-[var(--bg-primary)] font-bold text-[10px] hover:opacity-90 active:translate-y-[1px] border border-[var(--accent)] cursor-pointer uppercase transition-colors"
            >
              + {t("new_task")}
            </button>

            <button
              onClick={() => {
                import("@tauri-apps/api/core").then(({ invoke }) => {
                  invoke("open_aux_window", {
                    windowType: "settings",
                    taskId: null,
                    initialUrl: null,
                    audioUrl: null,
                    suggestedFilename: null,
                  }).catch(() => {
                    setShowSettingsModal(true);
                  });
                }).catch(() => setShowSettingsModal(true));
              }}
              title={t("options")}
              class="px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--accent)] border border-[var(--border)] hover:border-[var(--accent)] text-[10px] font-bold uppercase transition cursor-pointer flex items-center gap-1"
            >
              <span>{t("options")}</span>
            </button>

            <button
              onClick={() => cycleColorMode()}
              title={`Theme: ${(settings().colorMode || "dark").toUpperCase()} (Click to toggle Dark / Light / Auto)`}
              class="w-7 h-6 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] hover:text-[var(--accent)] border border-[var(--border)] hover:border-[var(--accent)] transition cursor-pointer flex items-center justify-center"
            >
              <Show when={settings().colorMode === "light"}>
                <IconThemeLight class="w-3 h-3" />
              </Show>
              <Show when={settings().colorMode === "auto"}>
                <IconThemeAuto class="w-3 h-3" />
              </Show>
              <Show when={!settings().colorMode || settings().colorMode === "dark"}>
                <IconThemeDark class="w-3 h-3" />
              </Show>
            </button>
          </div>

          <div class="h-full border-l border-[var(--border)]">
            <WindowControls
              onClose={() => {
                import("@tauri-apps/api/core").then(({ invoke }) => {
                  invoke("window_close").catch(() => {});
                }).catch(() => {});
              }}
            />
          </div>
        </div>
      </header>

      <div class="flex-1 flex overflow-hidden">
        <DownloadsTable
          tasks={tasks()}
          selectedTaskId={selectedTaskId()}
          onSelectTask={(id) => {
            setSelectedTaskId(id);
          }}
          onPauseResume={(id) => handlePauseResume(id)}
          onDeleteTask={(id, deleteFile) => handleCancelTask(id, deleteFile)}
        />

        <Show when={selectedTaskId()}>
          <ChunksInspector
            task={selectedTask()}
            onClose={() => setSelectedTaskId(null)}
          />
        </Show>
      </div>

    </div>
  );
}
