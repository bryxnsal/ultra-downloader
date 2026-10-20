(function () {
  const SENDER_ID = "ULTRA_YT_SNIFFER";
  let activeWidget = null;
  let targetMedia = null;
  let detectedStreams = [];
  let videoTitle = document.title || "video";
  let isMenuOpen = false;

  let lastVideoId = "";
  let lastUrl = location.href;

  function resetStreamsForNewVideo(newId, newTitle) {
    if (newId && newId === lastVideoId) {
      return;
    }
    detectedStreams = [];
    if (newId) lastVideoId = newId;
    videoTitle = newTitle || document.title || "video";
    chrome.runtime.sendMessage({ action: "clear_tab_streams" }).catch(() => {});
    if (activeWidget) {
      const menu = activeWidget.querySelector(".udm-grabber-menu");
      if (menu) menu.style.display = "none";
      isMenuOpen = false;
    }
  }

  if (location.hostname.includes("youtube.com")) {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("injected.js");
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {}

    window.addEventListener("message", (event) => {
      if (event.data && event.data.sender === SENDER_ID) {
        if (event.data.action === "youtube_streams_found") {
          const currentVideoId = event.data.videoId || getYouTubeVideoId();
          if (currentVideoId && lastVideoId && currentVideoId !== lastVideoId) {
            resetStreamsForNewVideo(currentVideoId, event.data.title);
          } else if (currentVideoId && !lastVideoId) {
            lastVideoId = currentVideoId;
          }

          if (event.data.title) videoTitle = event.data.title;
          mergeStreams(event.data.streams, currentVideoId);
          if (isMenuOpen && activeWidget) {
            renderMenuList();
          }
        }
      }
    });

    window.addEventListener("yt-navigate-start", () => {
      const newYtId = getYouTubeVideoId();
      if (newYtId && newYtId !== lastVideoId) {
        resetStreamsForNewVideo(newYtId, "");
      }
    });
    window.addEventListener("yt-navigate-finish", () => {
      const newYtId = getYouTubeVideoId();
      if (newYtId && newYtId !== lastVideoId) {
        resetStreamsForNewVideo(newYtId, document.title);
      }
      window.postMessage({ sender: "ULTRA_CONTENT", action: "request_youtube_streams" }, "*");
    });
  }

  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const ytId = getYouTubeVideoId();
      if (ytId && ytId !== lastVideoId) {
        resetStreamsForNewVideo(ytId, document.title);
        window.postMessage({ sender: "ULTRA_CONTENT", action: "request_youtube_streams" }, "*");
      } else if (!ytId && location.hostname.includes("youtube.com")) {
        resetStreamsForNewVideo("", document.title);
      }
    }
  }

  function getYouTubeVideoId() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get("v") || "";
    } catch {
      return "";
    }
  }

  function mergeStreams(newStreams, streamVideoId) {
    if (!Array.isArray(newStreams) || newStreams.length === 0) return;
    const currentVid = getYouTubeVideoId();
    
    if (currentVid && streamVideoId && streamVideoId.length === 11 && streamVideoId !== currentVid) {
      return;
    }

    const map = new Map();
    detectedStreams.forEach((s) => {
      map.set(s.itag || s.url, s);
    });
    newStreams.forEach((s) => {
      map.set(s.itag || s.url, { ...s, videoId: s.videoId || currentVid || "" });
    });
    detectedStreams = Array.from(map.values());
  }

  function findBestPlayer() {
    if (location.hostname.includes("youtube.com")) {
      const ytPlayer = document.querySelector("#movie_player") || document.querySelector("ytd-player");
      if (ytPlayer && ytPlayer.getBoundingClientRect().width > 150) {
        const video = ytPlayer.querySelector("video");
        return { container: ytPlayer, video: video || ytPlayer };
      }
      const ytVideo = document.querySelector(".html5-main-video") || document.querySelector("video");
      if (ytVideo && ytVideo.getBoundingClientRect().width > 150) {
        return { container: ytVideo.parentElement || ytVideo, video: ytVideo };
      }
    }

    const videos = Array.from(document.querySelectorAll("video"));
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const style = window.getComputedStyle(v);
      if (
        rect.width > 200 &&
        rect.height > 120 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0"
      ) {
        const parent = v.parentElement;
        return { container: parent || v, video: v };
      }
    }
    return null;
  }

  const I18N = {
    en: {
      btn_download: "DOWNLOAD",
      available_streams: "AVAILABLE STREAMS",
      download_video: "Download Video",
      analyzing: "Analyzing streams... Play video to capture.",
      title_hint: "Opening with Ultra Downloader",
      desc_hint: "Check 'Always allow this site to open links of this type' to start downloads instantly."
    },
    es: {
      btn_download: "DESCARGAR",
      available_streams: "TRANSMISIONES DISPONIBLES",
      download_video: "Descargar Video",
      analyzing: "Analizando transmisiones... Reproduce el video para capturar.",
      title_hint: "Abriendo con Ultra Downloader",
      desc_hint: "En el aviso de arriba, marca 'Permitir siempre a este sitio abrir enlaces de este tipo' para que tus descargas se abran al instante."
    }
  };

  let currentLang = "en";

  function getI18nText(key) {
    const dict = I18N[currentLang] || I18N.en;
    return dict[key] || I18N.en[key] || key;
  }

  function resolveEffectiveTheme(grabberTheme, appTheme) {
    if (!grabberTheme || grabberTheme === "same_as_app") {
      return appTheme || "matrix";
    }
    return grabberTheme;
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
      if (currentColorModeSetting === "auto" && activeWidget) {
        activeWidget.setAttribute("data-color-mode", resolveEffectiveColorMode("auto"));
      }
    });
  }

  function applyWidgetTheme(widget, grabberTheme, appTheme, customThemes, colorMode) {
    if (!widget) return;
    currentColorModeSetting = colorMode || "dark";
    widget.setAttribute("data-color-mode", resolveEffectiveColorMode(currentColorModeSetting));

    const effectiveTheme = resolveEffectiveTheme(grabberTheme, appTheme);
    const custom = (customThemes || []).find((ct) => ct.id === effectiveTheme);
    if (custom) {
      widget.setAttribute("data-theme", "custom");
      widget.style.setProperty("--udm-bg-primary", custom.bgPrimary);
      widget.style.setProperty("--udm-bg-secondary", custom.bgSecondary);
      widget.style.setProperty("--udm-bg-surface", custom.bgSurface);
      widget.style.setProperty("--udm-border", custom.border);
      widget.style.setProperty("--udm-text-main", custom.textMain);
      widget.style.setProperty("--udm-text-muted", custom.textMuted);
      widget.style.setProperty("--udm-accent", custom.accent);
      widget.style.setProperty("--udm-accent-muted", custom.accentMuted || custom.accent);
    } else {
      widget.style.removeProperty("--udm-bg-primary");
      widget.style.removeProperty("--udm-bg-secondary");
      widget.style.removeProperty("--udm-bg-surface");
      widget.style.removeProperty("--udm-border");
      widget.style.removeProperty("--udm-text-main");
      widget.style.removeProperty("--udm-text-muted");
      widget.style.removeProperty("--udm-accent");
      widget.style.removeProperty("--udm-accent-muted");
      widget.setAttribute("data-theme", effectiveTheme || "matrix");
    }
  }

  function updateWidgetText(widget) {
    if (!widget) return;
    const btnText = widget.querySelector(".udm-grabber-text");
    if (btnText) btnText.textContent = getI18nText("btn_download");
    const menuTitle = widget.querySelector(".udm-grabber-menu-title span:last-child");
    if (menuTitle) menuTitle.textContent = getI18nText("available_streams");
  }

  function createWidget() {
    if (activeWidget) return activeWidget;

    const widget = document.createElement("div");
    widget.className = "udm-grabber-widget";
    widget.style.display = "none";

    chrome.storage.local.get(["grabberTheme", "appTheme", "customThemes", "language", "colorMode"], (data) => {
      if (data.language) currentLang = data.language;
      applyWidgetTheme(
        widget,
        data.grabberTheme || "same_as_app",
        data.appTheme || "matrix",
        data.customThemes || [],
        data.colorMode || "dark"
      );
      updateWidgetText(widget);
    });

    widget.innerHTML = `
      <div class="udm-grabber-btn" title="Download with Ultra Downloader">
        <span class="udm-grabber-logo-sq"></span>
        <span class="udm-grabber-text">${getI18nText("btn_download")}</span>
        <span class="udm-grabber-arrow">▾</span>
      </div>
      <div class="udm-grabber-menu" style="display: none;">
        <div class="udm-grabber-menu-header">
          <div class="udm-grabber-menu-title">
            <span class="udm-grabber-logo-sq-sm"></span>
            <span>${getI18nText("available_streams")}</span>
          </div>
        </div>
        <div class="udm-grabber-list"></div>
      </div>
    `;

    const btn = widget.querySelector(".udm-grabber-btn");
    const menu = widget.querySelector(".udm-grabber-menu");

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      toggleMenu();

      window.postMessage({ sender: "ULTRA_CONTENT", action: "request_youtube_streams" }, "*");

      chrome.runtime.sendMessage({ action: "get_tab_streams" }).then((resp) => {
        if (resp && resp.streams && resp.streams.length > 0) {
          mergeStreams(resp.streams, resp.docId);
          if (isMenuOpen) {
            renderMenuList();
          }
        }
      }).catch(() => {});
    });

    document.addEventListener("click", (e) => {
      if (isMenuOpen && activeWidget && !activeWidget.contains(e.target)) {
        isMenuOpen = false;
        menu.style.display = "none";
      }
    });

    document.body.appendChild(widget);
    activeWidget = widget;
    return widget;
  }

  function renderMenuList() {
    if (!activeWidget) return;
    const menu = activeWidget.querySelector(".udm-grabber-menu");
    const list = activeWidget.querySelector(".udm-grabber-list");
    list.innerHTML = "";

    if (detectedStreams.length > 0) {
      const sorted = [...detectedStreams].sort((a, b) => {
        const typePriority = { muxed: 1, video: 2, audio: 3 };
        const pA = typePriority[a.type] || 2;
        const pB = typePriority[b.type] || 2;
        if (pA !== pB) return pA - pB;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

      const videoDisplayName = (videoTitle || document.title || "Video")
        .replace(/\s+/g, " ")
        .trim();

      const formatSize = (bytes) => {
        if (!bytes) return "";
        const b = parseInt(bytes, 10);
        if (isNaN(b) || b <= 0) return "";
        if (b > 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      };

      const audioStreams = detectedStreams.filter((s) => s.type === "audio");
      const bestAudioStream = [...audioStreams].sort((a, b) => {
        const isAacA = a.mimeType?.includes("mp4") || a.mimeType?.includes("m4a") ? 1 : 0;
        const isAacB = b.mimeType?.includes("mp4") || b.mimeType?.includes("m4a") ? 1 : 0;
        if (isAacA !== isAacB) return isAacB - isAacA;
        return (b.bitrate || 0) - (a.bitrate || 0);
      })[0] || null;

      sorted.forEach((stream) => {
        const item = document.createElement("div");
        item.className = "udm-grabber-item";
        const fileExt = (stream.ext || (stream.type === "audio" ? "m4a" : "mp4")).toUpperCase();
        const dur = stream.duration ? `(${stream.duration})` : "";
        
        let sizeStr = "";
        let totalSize = stream.contentLength ? parseInt(stream.contentLength, 10) : 0;
        if (stream.type === "video" && bestAudioStream && bestAudioStream.contentLength) {
          totalSize += parseInt(bestAudioStream.contentLength, 10);
        }

        if (totalSize > 0) {
          sizeStr = formatSize(totalSize);
        } else {
          try {
            const u = new URL(stream.url);
            const clen = u.searchParams.get("clen");
            if (clen) sizeStr = formatSize(clen);
          } catch (e) {}
        }
        const sizeBadge = sizeStr ? `<span class="udm-grabber-item-size" style="margin-left: 6px; font-weight: 600; color: var(--udm-accent, #22c55e);">${sizeStr}</span>` : "";

        const willMuxAudio = stream.type === "video" && bestAudioStream;
        const badgeLabel = stream.type === "muxed" || willMuxAudio ? "VIDEO" : stream.type === "video" ? "VIDEO" : "AUDIO";
        const badgeClass = stream.type === "muxed" || willMuxAudio ? "muxed" : stream.type;
        const extClass = (fileExt || "").toLowerCase();

        item.innerHTML = `
          <div class="udm-grabber-item-main">
            <div class="udm-grabber-item-title" title="${videoDisplayName}">
              ${videoDisplayName}
            </div>
            <div class="udm-grabber-item-info">
              <span class="udm-grabber-item-quality">${stream.quality || "Standard"}</span>
              ${sizeBadge}
              <span class="udm-grabber-item-dur">${dur}</span>
            </div>
          </div>
          <div class="udm-grabber-item-tags">
            <span class="udm-grabber-ext ext-${extClass}">${fileExt}</span>
            <span class="udm-grabber-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          isMenuOpen = false;
          menu.style.display = "none";

          let cleanTitle = (videoTitle || document.title || "video")
            .replace(/[/\\?%*:|"<>]/g, "_")
            .replace(/\s+/g, " ")
            .trim();
          let ext = (stream.ext || (stream.type === "audio" ? "m4a" : "mp4")).toLowerCase();
          if (stream.type === "video" && willMuxAudio) {
            ext = "mp4";
          }
          let cleanQuality = (stream.quality || "").replace(/[^a-zA-Z0-9]/g, "");
          let filename = `${cleanTitle}_${cleanQuality}.${ext}`;

          const payload = {
            action: "download_media",
            url: stream.url,
            audioUrl: willMuxAudio ? bestAudioStream.url : null,
            filename: filename
          };

          chrome.runtime.sendMessage(payload);
        });
        list.appendChild(item);
      });
    } else {
      let directSrc = targetMedia?.currentSrc || targetMedia?.src;
      if (!directSrc && targetMedia) {
        const srcEl = targetMedia.querySelector("source");
        if (srcEl) directSrc = srcEl.src;
      }

      if (directSrc && !directSrc.startsWith("blob:")) {
        const item = document.createElement("div");
        item.className = "udm-grabber-item";
        item.innerHTML = `
          <span>${getI18nText("download_video")}</span>
          <span class="udm-grabber-badge video">MP4</span>
        `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          isMenuOpen = false;
          menu.style.display = "none";
          let cleanTitle = (document.title || "video").replace(/[/\\?%*:|"<>]/g, "_");
          chrome.runtime.sendMessage({
            action: "download_media",
            url: directSrc,
            filename: `${cleanTitle}.mp4`
          });
        });
        list.appendChild(item);
      } else {
        const empty = document.createElement("div");
        empty.className = "udm-grabber-empty";
        empty.textContent = getI18nText("analyzing");
        list.appendChild(empty);
      }
    }
  }

  function toggleMenu() {
    if (!activeWidget) return;
    const menu = activeWidget.querySelector(".udm-grabber-menu");
    isMenuOpen = !isMenuOpen;

    if (!isMenuOpen) {
      menu.style.display = "none";
      return;
    }

    renderMenuList();
    menu.style.display = "flex";
  }

  function updateWidgetPosition() {
    const playerInfo = findBestPlayer();
    if (!playerInfo) {
      if (activeWidget) activeWidget.style.display = "none";
      return;
    }

    targetMedia = playerInfo.video;
    const container = playerInfo.container;
    const rect = container.getBoundingClientRect();

    if (rect.width < 100 || rect.height < 60) {
      if (activeWidget) activeWidget.style.display = "none";
      return;
    }

    const widget = createWidget();
    const btn = widget.querySelector(".udm-grabber-btn");

    const widgetWidth = btn ? (btn.offsetWidth || 118) : 118;
    const widgetHeight = btn ? (btn.offsetHeight || 28) : 28;

    let topPos = rect.top - widgetHeight - 6;
    if (topPos < 6) {
      topPos = rect.top + 8;
    }

    let leftPos = rect.right - widgetWidth - 8;
    if (leftPos < 10) leftPos = 10;

    const roundTop = Math.round(topPos);
    const roundLeft = Math.round(leftPos);

    if (widget.dataset.lastTop !== String(roundTop) || widget.dataset.lastLeft !== String(roundLeft)) {
      widget.dataset.lastTop = String(roundTop);
      widget.dataset.lastLeft = String(roundLeft);
      widget.style.top = `${roundTop}px`;
      widget.style.left = `${roundLeft}px`;
      widget.style.right = "auto";
    }

    if (widget.style.display !== "block") {
      widget.style.display = "block";
    }
  }

  window.addEventListener("resize", updateWidgetPosition, { passive: true });
  window.addEventListener("scroll", updateWidgetPosition, { passive: true });

  const observer = new MutationObserver(() => {
    updateWidgetPosition();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    updateWidgetPosition();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      updateWidgetPosition();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "trigger_deep_link" && message.deepLink) {
      try {
        const a = document.createElement("a");
        a.href = message.deepLink;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      } catch {
        try {
          window.location.assign(message.deepLink);
        } catch {}
      }

      showBrowserPermissionHint();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.language) {
        currentLang = changes.language.newValue || "en";
        updateWidgetText(activeWidget);
      }
      if (changes.grabberTheme || changes.appTheme || changes.customThemes || changes.colorMode) {
        chrome.storage.local.get(["grabberTheme", "appTheme", "customThemes", "colorMode"], (data) => {
          applyWidgetTheme(
            activeWidget,
            data.grabberTheme || "same_as_app",
            data.appTheme || "matrix",
            data.customThemes || [],
            data.colorMode || "dark"
          );
        });
      }
    }
  });

  function showBrowserPermissionHint() {
    if (sessionStorage.getItem("udm_permission_hint_seen")) return;
    sessionStorage.setItem("udm_permission_hint_seen", "1");

    const iconUrl = chrome.runtime.getURL("icons/icon-32.png");
    const hint = document.createElement("div");
    hint.className = "udm-permission-hint";
    hint.innerHTML = `
      <div class="udm-permission-hint-content">
        <img src="${iconUrl}" class="udm-permission-hint-icon" alt="UDM" style="width: 18px; height: 18px; object-fit: contain; flex-shrink: 0;" />
        <div class="udm-permission-hint-text">
          <strong>${getI18nText("title_hint")}</strong>
          <span>${getI18nText("desc_hint")}</span>
        </div>
        <button class="udm-permission-hint-close">&times;</button>
      </div>
    `;

    hint.querySelector(".udm-permission-hint-close").addEventListener("click", () => {
      hint.remove();
    });

    document.body.appendChild(hint);

    setTimeout(() => {
      if (hint.parentElement) {
        hint.style.opacity = "0";
        setTimeout(() => hint.remove(), 300);
      }
    }, 9000);
  }

  setInterval(() => {
    checkUrlChange();
    updateWidgetPosition();
  }, 1000);
})();
