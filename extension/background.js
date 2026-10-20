const ULTRA_BRIDGE_URL = "http://127.0.0.1:51248/api/config";

let activeExtensions = new Set();
let activeExcludedDomains = [];
let activeGrabberTheme = "same_as_app";
let activeAppTheme = "matrix";
let activeCustomThemes = [];
let activeLanguage = "en";
let activeColorMode = "dark";

function parseExtensionsString(extStr) {
  if (!extStr || typeof extStr !== "string") return [];
  return extStr
    .split(/[\s,;|]+/)
    .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function parseExceptionsString(excStr) {
  if (!excStr || typeof excStr !== "string") return [];
  return excStr
    .split(/[\s,;|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function fetchConfigFromBridge() {
  try {
    const resp = await fetch(ULTRA_BRIDGE_URL, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const config = await resp.json();
    if (config) {
      await chrome.storage.local.set({
        interceptExtensions: config.interceptExtensions,
        exceptionServers: config.exceptionServers,
        grabberTheme: config.grabberTheme || "same_as_app",
        appTheme: config.appTheme || "matrix",
        customThemes: config.customThemes || [],
        language: config.language || "en",
        colorMode: config.colorMode || "dark",
        bridgeConnected: true,
        lastBridgeSync: Date.now(),
      });
      return config;
    }
  } catch (err) {}
  return null;
}

try {
  chrome.alarms.create("sync_ultra_bridge", { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "sync_ultra_bridge") {
      fetchConfigFromBridge();
    }
  });
} catch {}

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    fetchConfigFromBridge();
  });
}

chrome.storage.local.get(
  ["interceptExtensions", "exceptionServers", "grabberTheme", "appTheme", "customThemes", "language", "colorMode"],
  (data) => {
    const rawExts = data.interceptExtensions || "";
    activeExtensions = new Set(parseExtensionsString(rawExts));
    activeExcludedDomains = parseExceptionsString(data.exceptionServers || "");
    activeGrabberTheme = data.grabberTheme || "same_as_app";
    activeAppTheme = data.appTheme || "matrix";
    activeCustomThemes = data.customThemes || [];
    activeLanguage = data.language || "en";
    activeColorMode = data.colorMode || "dark";

    fetchConfigFromBridge();
  }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.interceptExtensions) {
      activeExtensions = new Set(parseExtensionsString(changes.interceptExtensions.newValue));
    }
    if (changes.exceptionServers) {
      activeExcludedDomains = parseExceptionsString(changes.exceptionServers.newValue);
    }
    if (changes.grabberTheme) {
      activeGrabberTheme = changes.grabberTheme.newValue || "same_as_app";
    }
    if (changes.appTheme) {
      activeAppTheme = changes.appTheme.newValue || "matrix";
    }
    if (changes.customThemes) {
      activeCustomThemes = changes.customThemes.newValue || [];
    }
    if (changes.language) {
      activeLanguage = changes.language.newValue || "en";
    }
    if (changes.colorMode) {
      activeColorMode = changes.colorMode.newValue || "dark";
    }
  }
});

const ITAG_MAP = {
  18: { quality: "360p", type: "muxed" },
  22: { quality: "720p", type: "muxed" },
  137: { quality: "1080p (MP4)", type: "video" },
  248: { quality: "1080p (WebM)", type: "video" },
  399: { quality: "1080p (AV1)", type: "video" },
  136: { quality: "720p (MP4)", type: "video" },
  247: { quality: "720p (WebM)", type: "video" },
  135: { quality: "480p", type: "video" },
  244: { quality: "480p (WebM)", type: "video" },
  134: { quality: "360p", type: "video" },
  243: { quality: "360p (WebM)", type: "video" },
  140: { quality: "Audio 128k (M4A)", type: "audio" },
  251: { quality: "Audio 160k (Opus)", type: "audio" }
};

const tabStreams = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ultra-download-link",
    title: "Download with Ultra Downloader",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: "ultra-download-media",
    title: "Download Media with Ultra Downloader",
    contexts: ["video", "audio"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let targetUrl = "";
  if (info.menuItemId === "ultra-download-link" && info.linkUrl) {
    targetUrl = info.linkUrl;
  } else if (info.menuItemId === "ultra-download-media" && info.srcUrl) {
    targetUrl = info.srcUrl;
  }

  if (targetUrl) {
    await sendToUltra(targetUrl, tab?.url);
  }
});

if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const url = details.url;
      if (details.tabId > 0 && url.includes("googlevideo.com/videoplayback")) {
        try {
          const parsed = new URL(url);
          const itag = parseInt(parsed.searchParams.get("itag"), 10);
          const mime = parsed.searchParams.get("mime") || "";
          const clen = parsed.searchParams.get("clen") || null;
          const docId = parsed.searchParams.get("id") || "";

          if (itag) {
            let tabData = tabStreams.get(details.tabId);
            if (!tabData || (docId && tabData.docId && tabData.docId !== docId)) {
              tabData = { docId, streams: new Map() };
              tabStreams.set(details.tabId, tabData);
            } else if (docId && !tabData.docId) {
              tabData.docId = docId;
            }

            const info = ITAG_MAP[itag] || {
              quality: `itag ${itag} (${mime.split("/")[0]})`,
              type: mime.startsWith("audio") ? "audio" : "video"
            };

            parsed.searchParams.delete("range");
            parsed.searchParams.delete("begin");
            const cleanUrl = parsed.toString();

            tabData.streams.set(itag, {
              itag,
              docId,
              quality: info.quality,
              type: info.type,
              url: cleanUrl,
              contentLength: clen
            });
          }
        } catch (e) {}
      }
    },
    { urls: ["*://*.googlevideo.com/videoplayback*"] }
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreams.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    tabStreams.delete(tabId);
  }
});

function isDomainExcluded(url) {
  if (!url || activeExcludedDomains.length === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return activeExcludedDomains.some((d) => {
      if (d.startsWith("*.")) {
        const root = d.slice(2);
        return host === root || host.endsWith("." + root);
      }
      return host === d;
    });
  } catch {
    return false;
  }
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  console.log("[Ultra Extension] Download requested:", downloadItem.filename, downloadItem.url);

  if (!downloadItem.url || downloadItem.url.startsWith("blob:") || downloadItem.url.startsWith("data:")) {
    suggest();
    return;
  }

  if (isDomainExcluded(downloadItem.url) || isDomainExcluded(downloadItem.referrer)) {
    suggest();
    return;
  }

  const nameToCheck = (downloadItem.filename || downloadItem.url.split("?")[0]).toLowerCase();
  const ext = nameToCheck.split(".").pop();

  if (ext && activeExtensions.has(ext)) {
    chrome.downloads.cancel(downloadItem.id, () => {
      chrome.downloads.erase({ id: downloadItem.id });
    });

    sendToUltra(downloadItem.url, downloadItem.referrer, downloadItem.filename);
    return;
  }

  suggest();
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!downloadItem.url || downloadItem.url.startsWith("blob:") || downloadItem.url.startsWith("data:")) {
    return;
  }

  if (isDomainExcluded(downloadItem.url) || isDomainExcluded(downloadItem.referrer)) {
    return;
  }

  const urlPath = downloadItem.url.split("?")[0].toLowerCase();
  const ext = urlPath.split(".").pop();

  if (ext && activeExtensions.has(ext)) {
    chrome.downloads.cancel(downloadItem.id, () => {
      chrome.downloads.erase({ id: downloadItem.id });
    });
    sendToUltra(downloadItem.url, downloadItem.referrer);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "download_media" && message.url) {
    sendToUltra(message.url, sender.tab?.url, message.filename, message.audioUrl, sender.tab?.id).then((res) => {
      sendResponse({ status: "ok", res });
    });
    return true;
  }

  if (message.action === "get_tab_streams") {
    const tabId = sender.tab?.id;
    const tabData = tabId ? tabStreams.get(tabId) : null;
    const list = tabData && tabData.streams ? Array.from(tabData.streams.values()) : [];
    sendResponse({ streams: list, docId: tabData?.docId || null });
    return false;
  }

  if (message.action === "clear_tab_streams") {
    const tabId = sender.tab?.id;
    if (tabId) {
      tabStreams.delete(tabId);
    }
    sendResponse({ status: "cleared" });
    return false;
  }

  if (message.action === "settings_sync" && message.settings) {
    const s = message.settings;
    const toStore = {};
    if (s.interceptExtensions !== undefined) toStore.interceptExtensions = s.interceptExtensions;
    if (s.exceptionServers !== undefined) toStore.exceptionServers = s.exceptionServers;
    if (s.grabberTheme !== undefined) toStore.grabberTheme = s.grabberTheme;
    if (s.appTheme !== undefined) toStore.appTheme = s.appTheme;
    if (s.customThemes !== undefined) toStore.customThemes = s.customThemes;
    if (s.language !== undefined) toStore.language = s.language;
    if (s.colorMode !== undefined) toStore.colorMode = s.colorMode;

    chrome.storage.local.set(toStore, () => {
      sendResponse({ status: "synced", toStore });
    });
    return true;
  }
});

async function sendToUltra(url, referer, suggestedFilename, audioUrl, preferredTabId) {
  try {
    let cookiesStr = "";
    if (chrome.cookies) {
      try {
        const streamCookies = await chrome.cookies.getAll({ url });
        const ytCookies = (url.includes("googlevideo.com") || url.includes("youtube.com"))
          ? await chrome.cookies.getAll({ domain: ".youtube.com" })
          : [];
        
        const cookieMap = new Map();
        for (const c of [...streamCookies, ...ytCookies]) {
          cookieMap.set(c.name, c.value);
        }
        cookiesStr = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
      } catch {}
    }

    const payload = {
      action: "download",
      url,
      audio_url: audioUrl || null,
      filename: suggestedFilename || null,
      cookies: cookiesStr || null,
      referer: referer || null,
      user_agent: navigator.userAgent
    };

    const jsonStr = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const deepLinkUrl = `udm://download?data=${encodeURIComponent(b64)}`;

    let targetTabId = preferredTabId;
    if (!targetTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id) {
        targetTabId = activeTab.id;
      }
    }

    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, {
        action: "trigger_deep_link",
        deepLink: deepLinkUrl
      }).catch(() => {
        chrome.tabs.update(targetTabId, { url: deepLinkUrl });
      });
    }
  } catch (err) {
    console.error("[Ultra Extension] Failed to forward download to Ultra:", err);
  }
}
