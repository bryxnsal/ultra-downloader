import { For, Show, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { DownloadTask } from "../types";
import { formatBytes } from "../../../shared/utils";
import { useSettings } from "../../../shared/stores/settingsStore";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Play, Pause, Folder, ExternalLink, Copy, Trash2 } from "lucide-solid";

interface DownloadsTableProps {
  tasks: DownloadTask[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onPauseResume?: (id: string) => void;
  onDeleteTask?: (id: string, deleteFile: boolean) => void;
}

const STORAGE_COLS_KEY = "udm_table_col_widths_v2";

interface ColumnWidths {
  filename: number;
  size: number;
  progress: number;
  speed: number;
  status: number;
}

function loadStoredWidths(): ColumnWidths | null {
  try {
    const raw = localStorage.getItem(STORAGE_COLS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export function DownloadsTable(props: DownloadsTableProps) {
  const { t } = useSettings();

  let containerRef: HTMLDivElement | undefined;
  const [containerWidth, setContainerWidth] = createSignal<number>(800);
  const [hasExplicitResize, setHasExplicitResize] = createSignal<boolean>(loadStoredWidths() !== null);
  const [customWidths, setCustomWidths] = createSignal<ColumnWidths>(
    loadStoredWidths() || {
      filename: 320,
      size: 160,
      progress: 180,
      speed: 130,
      status: 90,
    }
  );

  const effectiveWidths = createMemo<ColumnWidths>(() => {
    if (hasExplicitResize()) {
      return customWidths();
    }

    const available = Math.max(500, containerWidth() - 4);
    const size = 150;
    const progress = 170;
    const speed = 120;
    const status = 90;
    const fixedTotal = size + progress + speed + status;

    const filename = Math.max(180, available - fixedTotal);

    return {
      filename,
      size,
      progress,
      speed,
      status,
    };
  });

  const sortedTasks = createMemo(() => {
    return [...props.tasks].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  });

  const DONT_ASK_DELETE_KEY = "udm_dont_ask_delete_disk";
  const [dontAskDeleteAgain, setDontAskDeleteAgain] = createSignal(
    localStorage.getItem(DONT_ASK_DELETE_KEY) === "true"
  );
  const [rememberPreference, setRememberPreference] = createSignal(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = createSignal<DownloadTask | null>(null);

  const [contextMenu, setContextMenu] = createSignal<{
    visible: boolean;
    x: number;
    y: number;
    task: DownloadTask | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    task: null,
  });

  const handleContextMenu = (e: MouseEvent, task: DownloadTask) => {
    e.preventDefault();
    e.stopPropagation();

    const clickX = e.clientX;
    const clickY = e.clientY;
    const menuWidth = 220;
    const menuHeight = 220;

    const posX = clickX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 8 : clickX;
    const posY = clickY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 8 : clickY;

    setContextMenu({
      visible: true,
      x: posX,
      y: posY,
      task,
    });
  };

  const closeContextMenu = () => {
    if (contextMenu().visible) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }
  };

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("contextmenu", closeContextMenu);

    if (containerRef) {
      setContainerWidth(containerRef.clientWidth);
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      resizeObserver.observe(containerRef);

      onCleanup(() => {
        resizeObserver.disconnect();
      });
    }
  });

  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("contextmenu", closeContextMenu);
  });

  const handleResizeStart = (colKey: keyof ColumnWidths, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const baseWidths = effectiveWidths();
    const startWidth = baseWidths[colKey];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);

      setHasExplicitResize(true);
      setCustomWidths(() => {
        const next = { ...baseWidths, [colKey]: newWidth };
        try {
          localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleOpenFile = async (task: DownloadTask) => {
    closeContextMenu();
    if (task.destination_path) {
      try {
        await openPath(task.destination_path);
      } catch (err) {
        console.error("Error al abrir archivo:", err);
      }
    }
  };

  const handleOpenFolder = async (task: DownloadTask) => {
    closeContextMenu();
    if (task.destination_path) {
      try {
        await revealItemInDir(task.destination_path);
      } catch (err) {
        console.error("Error al abrir carpeta:", err);
      }
    }
  };

  const handleCopyLink = async (task: DownloadTask) => {
    closeContextMenu();
    if (task.url) {
      try {
        await navigator.clipboard.writeText(task.url);
      } catch (err) {
        console.error("Error al copiar URL:", err);
      }
    }
  };

  const handleRemoveFromList = (task: DownloadTask) => {
    closeContextMenu();
    props.onDeleteTask?.(task.id, false);
  };

  const handleDeleteFromDiskClick = (task: DownloadTask) => {
    closeContextMenu();
    if (dontAskDeleteAgain()) {
      props.onDeleteTask?.(task.id, true);
    } else {
      setDeleteConfirmTask(task);
    }
  };

  const confirmDeleteFromDisk = () => {
    const task = deleteConfirmTask();
    if (!task) return;

    if (rememberPreference()) {
      try {
        localStorage.setItem(DONT_ASK_DELETE_KEY, "true");
        setDontAskDeleteAgain(true);
      } catch {}
    }

    props.onDeleteTask?.(task.id, true);
    setDeleteConfirmTask(null);
  };

  const handleRowDoubleClick = (task: DownloadTask) => {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      if (task.status === "Downloading" || task.status === "Paused" || task.status === "Assembling") {
        invoke("open_aux_window", {
          windowType: "progress",
          taskId: task.id,
          initialUrl: null,
          audioUrl: null,
          suggestedFilename: task.filename,
        }).catch(() => {});
      } else if (task.status === "Completed") {
        invoke("open_aux_window", {
          windowType: "complete",
          taskId: task.id,
          initialUrl: null,
          audioUrl: null,
          suggestedFilename: null,
        }).catch(() => {});
      } else {
        invoke("open_aux_window", {
          windowType: "file-info",
          taskId: task.id,
          initialUrl: task.url,
          audioUrl: task.audio_url || null,
          suggestedFilename: task.filename,
        }).catch(() => {});
      }
    }).catch(() => {});
  };

  return (
    <div ref={containerRef} class="flex-1 flex flex-col overflow-hidden relative min-w-0 w-full">
      <div class="overflow-x-auto flex-1 flex flex-col w-full">
        <div class="bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] tracking-wider flex items-center select-none shrink-0 min-w-full w-max">
          <div
            class="relative px-3 py-1.5 flex items-center shrink-0 border-r border-[var(--border)]"
            style={{ width: `${effectiveWidths().filename}px` }}
          >
            <span class="truncate">{t("col_filename")}</span>
            <div
              onMouseDown={(e) => handleResizeStart("filename", e)}
              class="absolute right-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-10"
            />
          </div>

          <div
            class="relative px-3 py-1.5 flex items-center shrink-0 border-r border-[var(--border)]"
            style={{ width: `${effectiveWidths().size}px` }}
          >
            <span class="truncate">{t("col_size")}</span>
            <div
              onMouseDown={(e) => handleResizeStart("size", e)}
              class="absolute right-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-10"
            />
          </div>

          <div
            class="relative px-3 py-1.5 flex items-center shrink-0 border-r border-[var(--border)]"
            style={{ width: `${effectiveWidths().progress}px` }}
          >
            <span class="truncate">{t("col_progress")}</span>
            <div
              onMouseDown={(e) => handleResizeStart("progress", e)}
              class="absolute right-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-10"
            />
          </div>

          <div
            class="relative px-3 py-1.5 flex items-center shrink-0 border-r border-[var(--border)]"
            style={{ width: `${effectiveWidths().speed}px` }}
          >
            <span class="truncate">{t("col_speed")}</span>
            <div
              onMouseDown={(e) => handleResizeStart("speed", e)}
              class="absolute right-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-10"
            />
          </div>

          <div
            class="relative px-3 py-1.5 flex items-center shrink-0 justify-end"
            style={{ width: `${effectiveWidths().status}px` }}
          >
            <span class="truncate">{t("col_status")}</span>
            <div
              onMouseDown={(e) => handleResizeStart("status", e)}
              class="absolute right-0 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-[var(--accent)] transition-colors z-10"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto divide-y divide-[var(--border)] min-w-full w-max">
          <Show
            when={sortedTasks().length > 0}
            fallback={
              <div class="p-8 text-center text-[var(--text-muted)] space-y-2">
                <p class="font-bold">[{t("empty_queue_title")}]</p>
                <p class="text-[11px]">{t("empty_queue_desc")}</p>
              </div>
            }
          >
            <For each={sortedTasks()}>
              {(task) => {
                const percent = () => Math.min(100, Math.floor((task.downloaded_bytes / (task.total_bytes || 1)) * 100));
                const isSelected = () => props.selectedTaskId === task.id;
                const isContextTarget = () => contextMenu().visible && contextMenu().task?.id === task.id;
                const isHighlighted = () => isSelected() || isContextTarget();

                return (
                  <div
                    onClick={() => props.onSelectTask(task.id)}
                    onDblClick={() => handleRowDoubleClick(task)}
                    onContextMenu={(e) => handleContextMenu(e, task)}
                    classList={{
                      "flex items-center px-0 py-2 cursor-pointer transition-colors text-[11px] border-l-4 select-none": true,
                      "bg-[var(--accent)]/15 text-[var(--accent)] font-bold border-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/40": isHighlighted(),
                      "border-transparent hover:bg-[var(--bg-hover)] text-[var(--text-main)]": !isHighlighted(),
                    }}
                  >
                    <div
                      class="px-3 truncate font-semibold shrink-0"
                      style={{ width: `${effectiveWidths().filename}px` }}
                      title={task.filename}
                    >
                      {task.filename}
                    </div>

                    <div
                      class="px-3 text-[var(--text-muted)] truncate shrink-0"
                      style={{ width: `${effectiveWidths().size}px` }}
                    >
                      {formatBytes(task.downloaded_bytes)} / {formatBytes(task.total_bytes)}
                    </div>

                    <div
                      class="px-3 pr-4 shrink-0"
                      style={{ width: `${effectiveWidths().progress}px` }}
                    >
                      <div class="flex justify-between text-[10px] mb-0.5">
                        <span>{percent()}%</span>
                      </div>
                      <div class="w-full h-1.5 bg-[var(--bg-primary)] border border-[var(--border)]">
                        <div
                          class="h-full bg-[var(--accent)]"
                          style={{ width: `${percent()}%` }}
                        ></div>
                      </div>
                    </div>

                    <div
                      class="px-3 font-mono truncate shrink-0"
                      style={{ width: `${effectiveWidths().speed}px` }}
                    >
                      {task.status === "Downloading" ? `${formatBytes(task.speed_bytes_sec)}/s` : "---"}
                    </div>

                    <div
                      class="px-3 text-right uppercase text-[10px] truncate shrink-0"
                      style={{ width: `${effectiveWidths().status}px` }}
                    >
                      {task.status === "Downloading" ? (
                        <span class="text-[var(--accent)]">[RUN]</span>
                      ) : typeof task.status === "object" && task.status !== null && "Error" in task.status ? (
                        <span class="text-red-400 font-bold" title={(task.status as any).Error}>[ERR]</span>
                      ) : (
                        <span class="text-[var(--text-muted)]">[{task.status}]</span>
                      )}
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </div>

      <Show when={contextMenu().visible && contextMenu().task}>
        {(() => {
          const task = contextMenu().task!;
          const isDownloading = task.status === "Downloading";
          const isCompleted = task.status === "Completed";

          return (
            <div
              class="fixed z-50 bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl py-1 w-56 text-[11px] text-[var(--text-main)] select-none animate-in fade-in duration-100"
              style={{
                left: `${contextMenu().x}px`,
                top: `${contextMenu().y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                disabled={isCompleted}
                onClick={() => {
                  closeContextMenu();
                  props.onPauseResume?.(task.id);
                }}
                class={`w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors ${
                  isCompleted
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-[var(--bg-surface)] hover:text-[var(--accent)]"
                }`}
              >
                {isDownloading ? (
                  <>
                    <Pause size={13} class="text-[var(--accent)]" />
                    <span>{t("ctx_pause")}</span>
                  </>
                ) : (
                  <>
                    <Play size={13} class="text-[var(--accent)]" />
                    <span>{t("ctx_resume")}</span>
                  </>
                )}
              </button>

              <div class="h-[1px] bg-[var(--border)] my-1"></div>

              <button
                disabled={!isCompleted}
                onClick={() => handleOpenFile(task)}
                class={`w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors ${
                  !isCompleted
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-[var(--bg-surface)] hover:text-[var(--accent)]"
                }`}
              >
                <ExternalLink size={13} class="text-[var(--text-muted)]" />
                <span>{t("ctx_open_file")}</span>
              </button>

              <button
                onClick={() => handleOpenFolder(task)}
                class="w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--accent)]"
              >
                <Folder size={13} class="text-[var(--text-muted)]" />
                <span>{t("ctx_open_folder")}</span>
              </button>

              <button
                onClick={() => handleCopyLink(task)}
                class="w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--accent)]"
              >
                <Copy size={13} class="text-[var(--text-muted)]" />
                <span>{t("ctx_copy_link")}</span>
              </button>

              <div class="h-[1px] bg-[var(--border)] my-1"></div>

              <button
                onClick={() => handleRemoveFromList(task)}
                class="w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)] text-[var(--text-muted)]"
              >
                <Trash2 size={13} class="opacity-70" />
                <span>{t("ctx_remove_from_list")}</span>
              </button>

              <button
                onClick={() => handleDeleteFromDiskClick(task)}
                class="w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors hover:bg-[var(--bg-surface)] hover:text-red-400 text-red-500/90 font-bold"
              >
                <Trash2 size={13} class="text-red-400" />
                <span>{t("ctx_delete_file")}</span>
              </button>
            </div>
          );
        })()}
      </Show>

      <Show when={deleteConfirmTask()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 select-none">
          <div class="w-full max-w-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl flex flex-col font-mono text-[11px]">
            <div class="h-9 px-3 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between font-bold text-red-400">
              <div class="flex items-center gap-1.5">
                <Trash2 size={13} />
                <span>{t("confirm_delete_title")}</span>
              </div>
              <button
                onClick={() => setDeleteConfirmTask(null)}
                class="text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div class="p-4 space-y-3 bg-[var(--bg-primary)]">
              <p class="text-[var(--text-main)] leading-relaxed">
                {t("confirm_delete_msg")}
              </p>

              <div class="p-2 border border-[var(--border)] bg-[var(--bg-surface)] space-y-1">
                <div class="text-[var(--accent)] font-bold truncate">
                  {deleteConfirmTask()?.filename}
                </div>
                <div class="text-[10px] text-[var(--text-muted)] truncate select-all">
                  {deleteConfirmTask()?.destination_path}
                </div>
              </div>

              <label class="flex items-center gap-2 cursor-pointer pt-1 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={rememberPreference()}
                  onChange={(e) => setRememberPreference(e.currentTarget.checked)}
                  class="w-3.5 h-3.5 rounded-none accent-[var(--accent)] cursor-pointer"
                />
                <span>{t("confirm_delete_remember")}</span>
              </label>
            </div>

            <div class="h-11 px-3 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmTask(null)}
                class="px-3 py-1 bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-main)] hover:border-[var(--accent)] cursor-pointer font-bold uppercase transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmDeleteFromDisk}
                class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold uppercase cursor-pointer transition-colors shadow-sm"
              >
                {t("delete_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
