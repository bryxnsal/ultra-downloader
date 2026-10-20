import { createSignal, For, Show } from "solid-js";
import { useSettings } from "../../../../shared/stores/settingsStore";
import { CustomTheme, Theme, ColorMode } from "../../types";
import { IconThemeDark, IconThemeLight, IconThemeAuto } from "../../../../shared/components/ThemeIcons";

export function ThemeTab() {
  const { settings, updateSettings, applyTheme, t } = useSettings();

  const [isEditorOpen, setIsEditorOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);

  const [formName, setFormName] = createSignal("");
  const [formAccent, setFormAccent] = createSignal("#3b82f6");
  const [formBgPrimary, setFormBgPrimary] = createSignal("#090a0f");
  const [formBgSurface, setFormBgSurface] = createSignal("#131620");
  const [formTextMain, setFormTextMain] = createSignal("#f8fafc");

  const presets: { id: Theme; label: string; descKey: any; color: string }[] = [
    { id: "matrix", label: "MATRIX", descKey: "mode_matrix_desc", color: "#22c55e" },
    { id: "amber", label: "AMBER", descKey: "mode_amber_desc", color: "#f59e0b" },
    { id: "cyan", label: "CYAN", descKey: "mode_cyan_desc", color: "#06b6d4" },
    { id: "mono", label: "MONO", descKey: "mode_mono_desc", color: "#ffffff" },
    { id: "dracula", label: "DRACULA", descKey: "mode_dracula_desc", color: "#bd93f9" },
  ];

  const customThemes = () => settings().customThemes || [];

  const openNewForm = () => {
    setEditingId(null);
    setFormName("Cyberpunk Neon");
    setFormAccent("#ec4899");
    setFormBgPrimary("#0f051d");
    setFormBgSurface("#1b0a33");
    setFormTextMain("#fdf4ff");
    setIsEditorOpen(true);
  };

  const openEditForm = (ct: CustomTheme) => {
    setEditingId(ct.id);
    setFormName(ct.name);
    setFormAccent(ct.accent);
    setFormBgPrimary(ct.bgPrimary);
    setFormBgSurface(ct.bgSurface);
    setFormTextMain(ct.textMain);
    setIsEditorOpen(true);
  };

  const handleSaveTheme = () => {
    const name = formName().trim() || "Custom Theme";
    const accent = formAccent();
    const bgPrimary = formBgPrimary();
    const bgSurface = formBgSurface();
    const textMain = formTextMain();

    const currentList = customThemes();
    let updatedList: CustomTheme[];
    let targetId: string;

    if (editingId()) {
      targetId = editingId()!;
      updatedList = currentList.map((item) =>
        item.id === targetId
          ? {
              ...item,
              name,
              accent,
              bgPrimary,
              bgSecondary: bgPrimary,
              bgSurface,
              border: bgSurface,
              textMain,
              textMuted: "#94a3b8",
            }
          : item
      );
    } else {
      targetId = `custom-${Date.now()}`;
      const newTheme: CustomTheme = {
        id: targetId,
        name,
        accent,
        bgPrimary,
        bgSecondary: bgPrimary,
        bgSurface,
        border: bgSurface,
        textMain,
        textMuted: "#94a3b8",
      };
      updatedList = [...currentList, newTheme];
    }

    updateSettings({
      customThemes: updatedList,
      theme: targetId,
    });
    setIsEditorOpen(false);
  };

  const handleDeleteTheme = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const currentList = customThemes();
    const filtered = currentList.filter((ct) => ct.id !== id);
    const nextTheme = settings().theme === id ? "matrix" : settings().theme;

    updateSettings({
      customThemes: filtered,
      theme: nextTheme,
    });
  };

  return (
    <div class="space-y-5">
      <div>
        <span class="font-bold text-[var(--accent)] block text-[10px] mb-2 tracking-wider">
          {t("theme_section_title")}
        </span>
        <div class="grid grid-cols-3 gap-2">
          {(
            [
              { id: "dark", label: t("theme_dark"), icon: () => <IconThemeDark class="w-3.5 h-3.5" /> },
              { id: "light", label: t("theme_light"), icon: () => <IconThemeLight class="w-3.5 h-3.5" /> },
              { id: "auto", label: t("theme_auto"), icon: () => <IconThemeAuto class="w-3.5 h-3.5" /> },
            ] as { id: ColorMode; label: string; icon: () => any }[]
          ).map((m) => {
            const isActive = () => (settings().colorMode || "dark") === m.id;
            return (
              <button
                type="button"
                onClick={() => updateSettings({ colorMode: m.id })}
                class={`p-2.5 border text-center font-bold text-[11px] transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  isActive()
                    ? "bg-[var(--bg-primary)] border-[var(--accent)] text-[var(--accent)] shadow-sm"
                    : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                <div class="flex items-center justify-center h-4">{m.icon()}</div>
                <span class="uppercase tracking-wider text-[10px]">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span class="font-bold text-[var(--accent)] block text-[10px] mb-2 tracking-wider">
          {t("color_modes")}
        </span>
        <div class="grid grid-cols-1 gap-2">
          <For each={presets}>
            {(th) => (
              <div
                onClick={() => applyTheme(th.id)}
                class={`p-2.5 border cursor-pointer transition flex items-center justify-between ${
                  settings().theme === th.id
                    ? "bg-[var(--bg-primary)] border-[var(--accent)] text-[var(--accent)] font-bold shadow-sm"
                    : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-3.5 h-3.5 rounded-xs border border-black/40 shadow-xs shrink-0"
                    style={{ "background-color": th.color }}
                  ></div>
                  <div>
                    <div class="text-[11px] font-bold uppercase tracking-wider">{th.label}</div>
                    <div class="text-[10px] font-normal text-[var(--text-muted)]">{t(th.descKey)}</div>
                  </div>
                </div>
                <div class="w-4 h-4 border border-[var(--border)] flex items-center justify-center">
                  {settings().theme === th.id && (
                    <div class="w-2.5 h-2.5 bg-[var(--accent)]"></div>
                  )}
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-[var(--accent)] block text-[10px] tracking-wider">
            {t("custom_color_modes")}
          </span>
          <button
            onClick={openNewForm}
            class="px-2.5 py-1 text-[10px] font-bold uppercase border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition cursor-pointer"
          >
            + {t("create_custom_color_mode")}
          </button>
        </div>

        <Show when={isEditorOpen()}>
          <div class="border-2 border-[var(--accent)] p-3.5 bg-[var(--bg-primary)] mb-3 space-y-3">
            <span class="font-bold text-[11px] text-[var(--text-main)] block uppercase">
              {editingId() ? t("edit_color_mode") : t("create_custom_color_mode")}
            </span>

            <div>
              <label class="block text-[9px] text-[var(--text-muted)] font-bold mb-1">
                {t("color_mode_name_label")}
              </label>
              <input
                type="text"
                value={formName()}
                onInput={(e) => setFormName(e.currentTarget.value)}
                class="w-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div class="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <label class="block text-[9px] text-[var(--text-muted)] font-bold mb-1">
                  {t("accent_color_label")}
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    value={formAccent()}
                    onInput={(e) => setFormAccent(e.currentTarget.value)}
                    class="w-7 h-7 p-0 border border-[var(--border)] bg-transparent cursor-pointer rounded-xs"
                  />
                  <span class="font-mono text-[10px] uppercase text-[var(--text-main)]">{formAccent()}</span>
                </div>
              </div>

              <div>
                <label class="block text-[9px] text-[var(--text-muted)] font-bold mb-1">
                  {t("bg_primary_label")}
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    value={formBgPrimary()}
                    onInput={(e) => setFormBgPrimary(e.currentTarget.value)}
                    class="w-7 h-7 p-0 border border-[var(--border)] bg-transparent cursor-pointer rounded-xs"
                  />
                  <span class="font-mono text-[10px] uppercase text-[var(--text-main)]">{formBgPrimary()}</span>
                </div>
              </div>

              <div>
                <label class="block text-[9px] text-[var(--text-muted)] font-bold mb-1">
                  {t("bg_surface_label")}
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    value={formBgSurface()}
                    onInput={(e) => setFormBgSurface(e.currentTarget.value)}
                    class="w-7 h-7 p-0 border border-[var(--border)] bg-transparent cursor-pointer rounded-xs"
                  />
                  <span class="font-mono text-[10px] uppercase text-[var(--text-main)]">{formBgSurface()}</span>
                </div>
              </div>

              <div>
                <label class="block text-[9px] text-[var(--text-muted)] font-bold mb-1">
                  {t("text_color_label")}
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    value={formTextMain()}
                    onInput={(e) => setFormTextMain(e.currentTarget.value)}
                    class="w-7 h-7 p-0 border border-[var(--border)] bg-transparent cursor-pointer rounded-xs"
                  />
                  <span class="font-mono text-[10px] uppercase text-[var(--text-main)]">{formTextMain()}</span>
                </div>
              </div>
            </div>

            <div class="p-2.5 rounded border border-white/10 flex items-center justify-between" style={{ "background-color": formBgSurface(), color: formTextMain() }}>
              <span class="text-[10px] font-bold">Preview / Vista Previa</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ "background-color": formAccent(), color: formBgPrimary() }}>
                {formName() || "Theme"}
              </span>
            </div>

            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                class="px-3 py-1 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-[10px] font-bold uppercase cursor-pointer"
              >
                {t("cancel_color_mode")}
              </button>
              <button
                type="button"
                onClick={handleSaveTheme}
                class="px-3.5 py-1 bg-[var(--accent)] text-[var(--bg-primary)] text-[10px] font-bold uppercase hover:opacity-90 cursor-pointer"
              >
                {t("save_color_mode")}
              </button>
            </div>
          </div>
        </Show>

        <Show
          when={customThemes().length > 0}
          fallback={
            <div class="p-4 border border-dashed border-[var(--border)] text-center text-[var(--text-muted)] text-[10px]">
              No custom color modes created yet. Click "+ Create Custom Color Mode" to add one.
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-2">
            <For each={customThemes()}>
              {(ct) => (
                <div
                  onClick={() => applyTheme(ct.id)}
                  class={`p-2.5 border cursor-pointer transition flex items-center justify-between ${
                    settings().theme === ct.id
                      ? "bg-[var(--bg-primary)] border-[var(--accent)] text-[var(--accent)] font-bold shadow-sm"
                      : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-3.5 h-3.5 rounded-xs border border-black/40 shrink-0"
                      style={{ "background-color": ct.accent }}
                    ></div>
                    <div>
                      <div class="text-[11px] font-bold uppercase tracking-wider">{ct.name}</div>
                      <div class="text-[9px] font-mono text-[var(--text-muted)]">{ct.accent} / {ct.bgPrimary}</div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditForm(ct);
                      }}
                      class="px-2 py-0.5 border border-[var(--border)] text-[9px] uppercase font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer"
                    >
                      {t("edit_color_mode")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTheme(ct.id, e)}
                      class="px-2 py-0.5 border border-red-500/40 text-[9px] uppercase font-bold text-red-400 hover:bg-red-500 hover:text-white cursor-pointer"
                    >
                      {t("delete_color_mode")}
                    </button>
                    <div class="w-4 h-4 ml-1 border border-[var(--border)] flex items-center justify-center">
                      {settings().theme === ct.id && (
                        <div class="w-2.5 h-2.5 bg-[var(--accent)]"></div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="border border-[var(--border)] p-3 bg-[var(--bg-primary)] space-y-2">
        <span class="font-bold text-[var(--accent)] block text-[10px]">
          {t("grabber_color_mode")}
        </span>
        <p class="text-[9px] text-[var(--text-muted)] mb-2">
          {t("grabber_color_mode_desc")}
        </p>
        <select
          value={settings().grabberTheme || "same_as_app"}
          onChange={(e) => updateSettings({ grabberTheme: e.currentTarget.value as Theme })}
          class="w-full bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--accent)] font-bold focus:outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          <option value="same_as_app">{t("same_as_app_color_mode")}</option>
          {presets.map((p) => (
            <option value={p.id}>
              {p.label} ({t(p.descKey)})
            </option>
          ))}
          {(settings().customThemes || []).map((ct) => (
            <option value={ct.id}>{ct.name} (Custom)</option>
          ))}
        </select>
      </div>
    </div>
  );
}
