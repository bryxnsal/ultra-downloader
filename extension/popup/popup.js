const extsInput = document.getElementById("extensions-input");
const themeSelect = document.getElementById("theme-select");
const saveMsg = document.getElementById("save-msg");
const openBtn = document.getElementById("open-app-btn");

function showSaved() {
  saveMsg.style.display = "inline";
  setTimeout(() => {
    saveMsg.style.display = "none";
  }, 1500);
}

const statusText = document.getElementById("status-text");
const extLabel = document.getElementById("ext-label");
const themeLabel = document.getElementById("theme-label");

const POPUP_I18N = {
  en: {
    synced: "SYNCED WITH ULTRA APP",
    disconnected: "DESKTOP APP DISCONNECTED",
    exts: "INTERCEPTED EXTENSIONS",
    theme: "VIDEO BUTTON COLOR MODE",
    open_app: "OPEN ULTRA DOWNLOADER",
    same_as_app: "MATCH APP COLOR MODE (Auto)",
  },
  es: {
    synced: "SINCRONIZADO CON APP ULTRA",
    disconnected: "APP DE ESCRITORIO DESCONECTADA",
    exts: "EXTENSIONES INTERCEPTADAS",
    theme: "MODO DE COLOR DEL BOTÓN DE VIDEO",
    open_app: "ABRIR ULTRA DOWNLOADER",
    same_as_app: "IGUAL QUE LA APP (Automático)",
  }
};

let currentLang = "en";

function applyLanguage(lang) {
  currentLang = lang || "en";
  const t = POPUP_I18N[currentLang] || POPUP_I18N.en;
  chrome.storage.local.get(["bridgeConnected"], (data) => {
    const isConnected = data.bridgeConnected !== false;
    if (statusText) statusText.textContent = isConnected ? t.synced : t.disconnected;
    const indicator = document.querySelector(".indicator");
    if (indicator) {
      indicator.style.background = isConnected ? "var(--accent)" : "#ef4444";
      indicator.style.boxShadow = isConnected ? "0 0 6px var(--accent)" : "0 0 6px #ef4444";
    }
  });
  if (extLabel) extLabel.textContent = t.exts;
  if (themeLabel) themeLabel.textContent = t.theme;
  if (openBtn) openBtn.textContent = t.open_app;
}

function resolveEffectiveColorMode(mode) {
  if (mode === "auto") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return mode === "light" ? "light" : "dark";
}

let currentColorModeSetting = "dark";
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (currentColorModeSetting === "auto") {
      document.documentElement.setAttribute("data-color-mode", resolveEffectiveColorMode("auto"));
    }
  });
}

function applyThemeToPopup(theme, appTheme, customThemes, colorMode) {
  currentColorModeSetting = colorMode || "dark";
  const effectiveMode = resolveEffectiveColorMode(currentColorModeSetting);
  const root = document.documentElement;
  root.setAttribute("data-color-mode", effectiveMode);

  const effective = (!theme || theme === "same_as_app") ? (appTheme || "matrix") : theme;
  const custom = (customThemes || []).find((ct) => ct.id === effective);

  if (custom) {
    root.setAttribute("data-theme", "custom");
    root.style.setProperty("--bg-primary", custom.bgPrimary);
    root.style.setProperty("--bg-secondary", custom.bgSecondary);
    root.style.setProperty("--bg-surface", custom.bgSurface);
    root.style.setProperty("--border", custom.border);
    root.style.setProperty("--text-main", custom.textMain);
    root.style.setProperty("--text-muted", custom.textMuted);
    root.style.setProperty("--accent", custom.accent);
    root.style.setProperty("--accent-muted", custom.accentMuted || custom.accent);
  } else {
    root.style.removeProperty("--bg-primary");
    root.style.removeProperty("--bg-secondary");
    root.style.removeProperty("--bg-surface");
    root.style.removeProperty("--border");
    root.style.removeProperty("--text-main");
    root.style.removeProperty("--text-muted");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-muted");
    if (!effective || effective === "matrix") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", effective);
    }
  }
}

function renderThemes(selectedTheme, customThemes) {
  const t = POPUP_I18N[currentLang] || POPUP_I18N.en;
  themeSelect.innerHTML = `
    <option value="same_as_app">${t.same_as_app || "MATCH APP COLOR MODE (Auto)"}</option>
    <option value="matrix">MATRIX (Green)</option>
    <option value="amber">AMBER (Amber)</option>
    <option value="cyan">CYAN (Cyan)</option>
    <option value="dracula">DRACULA (Purple)</option>
    <option value="mono">MONO (High Contrast)</option>
  `;

  if (Array.isArray(customThemes)) {
    customThemes.forEach((ct) => {
      const opt = document.createElement("option");
      opt.value = ct.id;
      opt.textContent = `${ct.name} (Custom)`;
      themeSelect.appendChild(opt);
    });
  }

  themeSelect.value = selectedTheme || "same_as_app";
}

chrome.storage.local.get(
  ["interceptExtensions", "grabberTheme", "appTheme", "customThemes", "language", "colorMode", "bridgeConnected"],
  (data) => {
    applyLanguage(data.language);
    extsInput.value = data.interceptExtensions || "";
    const currentTheme = data.grabberTheme || "same_as_app";
    const appTheme = data.appTheme || "matrix";
    const customList = data.customThemes || [];
    const colorMode = data.colorMode || "dark";

    renderThemes(currentTheme, customList);
    applyThemeToPopup(currentTheme, appTheme, customList, colorMode);

    fetch("http://127.0.0.1:51248/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg) {
          chrome.storage.local.set({
            interceptExtensions: cfg.interceptExtensions,
            exceptionServers: cfg.exceptionServers,
            grabberTheme: cfg.grabberTheme || "same_as_app",
            appTheme: cfg.appTheme || "matrix",
            customThemes: cfg.customThemes || [],
            language: cfg.language || "en",
            colorMode: cfg.colorMode || "dark",
            bridgeConnected: true,
          });
        }
      })
      .catch(() => {
        chrome.storage.local.set({ bridgeConnected: false });
      });
  }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.bridgeConnected !== undefined) {
      applyLanguage(currentLang);
    }
    if (changes.language) {
      applyLanguage(changes.language.newValue);
    }
    if (changes.interceptExtensions) {
      extsInput.value = changes.interceptExtensions.newValue || "";
    }
    if (changes.grabberTheme || changes.appTheme || changes.customThemes || changes.colorMode) {
      chrome.storage.local.get(["grabberTheme", "appTheme", "customThemes", "colorMode"], (data) => {
        const theme = data.grabberTheme || "same_as_app";
        const appTheme = data.appTheme || "matrix";
        const customList = data.customThemes || [];
        const colorMode = data.colorMode || "dark";
        renderThemes(theme, customList);
        applyThemeToPopup(theme, appTheme, customList, colorMode);
      });
    }
  }
});

openBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "udm://open" });
});
