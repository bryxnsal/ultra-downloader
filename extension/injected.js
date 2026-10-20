(function () {
  const SENDER_ID = "ULTRA_YT_SNIFFER";

  function parseStreamingData(streamingData, videoDetails) {
    if (!streamingData) return;
    const streams = [];

    const title = videoDetails?.title || document.title || "YouTube_Video";
    const durationSec = videoDetails?.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : 0;
    const author = videoDetails?.author || "";

    const formatDuration = (sec) => {
      if (!sec) return "";
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    const durationStr = formatDuration(durationSec);

    const extractUrl = (fmt) => {
      if (fmt.url) return fmt.url;
      const cipher = fmt.signatureCipher || fmt.cipher || "";
      if (cipher) {
        try {
          const params = new URLSearchParams(cipher);
          const rawUrl = params.get("url");
          const sig = params.get("s") || params.get("sig");
          const sp = params.get("sp") || "sig";
          if (rawUrl) {
            return sig ? `${rawUrl}&${sp}=${encodeURIComponent(sig)}` : rawUrl;
          }
        } catch (e) {}
      }
      return "";
    };

    if (streamingData.formats && Array.isArray(streamingData.formats)) {
      streamingData.formats.forEach((fmt) => {
        const streamUrl = extractUrl(fmt);
        if (!streamUrl) return;

        const ext = fmt.mimeType?.includes("webm") ? "webm" : "mp4";
        streams.push({
          itag: fmt.itag,
          quality: fmt.qualityLabel || `${fmt.height}p` || "Standard",
          mimeType: fmt.mimeType,
          type: "muxed",
          ext: ext,
          duration: durationStr,
          url: streamUrl,
          contentLength: fmt.contentLength,
          bitrate: fmt.bitrate
        });
      });
    }

    if (streamingData.adaptiveFormats && Array.isArray(streamingData.adaptiveFormats)) {
      streamingData.adaptiveFormats.forEach((fmt) => {
        const streamUrl = extractUrl(fmt);
        if (!streamUrl) return;

        const isAudio = fmt.mimeType && fmt.mimeType.startsWith("audio/");
        const ext = isAudio
          ? (fmt.mimeType?.includes("webm") ? "opus" : "m4a")
          : (fmt.mimeType?.includes("webm") ? "webm" : "mp4");

        streams.push({
          itag: fmt.itag,
          quality: isAudio
            ? `Audio (${Math.round((fmt.bitrate || 128000) / 1000)} kbps)`
            : (fmt.qualityLabel || `${fmt.height}p`),
          mimeType: fmt.mimeType,
          type: isAudio ? "audio" : "video",
          ext: ext,
          duration: durationStr,
          url: streamUrl,
          contentLength: fmt.contentLength,
          bitrate: fmt.bitrate
        });
      });
    }

    const videoId = videoDetails?.videoId || "";

    if (streams.length > 0) {
      window.postMessage(
        {
          sender: SENDER_ID,
          action: "youtube_streams_found",
          title: title,
          videoId: videoId,
          streams: streams
        },
        "*"
      );
    }
  }

  function getVisitorData() {
    try {
      if (window.ytInitialPlayerResponse?.responseContext?.visitorData) {
        return window.ytInitialPlayerResponse.responseContext.visitorData;
      }
      if (window.ytcfg && typeof window.ytcfg.get === "function") {
        const vd = window.ytcfg.get("VISITOR_DATA");
        if (vd) return vd;
        const inndata = window.ytcfg.get("INNERTUBE_CONTEXT");
        if (inndata?.client?.visitorData) return inndata.client.visitorData;
      }
    } catch (e) {}
    return null;
  }

  let lastFetchedVisionVideoId = "";

  async function fetchVisionOsStreams(videoId) {
    if (!videoId || videoId === lastFetchedVisionVideoId) return;
    lastFetchedVisionVideoId = videoId;

    try {
      const visitorData = getVisitorData();
      const clientPayload = {
        clientName: 101,
        clientVersion: "1.02",
        osName: "visionOS",
        osVersion: "26.5.23O471",
        platform: "MOBILE",
        deviceMake: "Apple",
        deviceModel: "RealityDevice17,1"
      };

      if (visitorData) {
        clientPayload.visitorData = visitorData;
      }

      const bodyData = {
        context: {
          client: clientPayload
        },
        videoId: videoId
      };

      const res = await (origFetch || window.fetch)("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": "101",
          "X-YouTube-Client-Version": "1.02"
        },
        body: JSON.stringify(bodyData),
        credentials: "include"
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.streamingData) {
          console.log("[Ultra Extension] Intercepted clean VISIONOS streams for:", videoId, "formats:", data.streamingData.formats?.length, "adaptive:", data.streamingData.adaptiveFormats?.length);
          parseStreamingData(data.streamingData, data.videoDetails || { videoId });
          return;
        }
      }
      lastFetchedVisionVideoId = "";
    } catch (err) {
      lastFetchedVisionVideoId = "";
      console.warn("[Ultra Extension] VisionOS fetch error:", err);
    }
  }

  function checkInitialPlayerResponse() {
    try {
      const currentUrl = new URL(location.href);
      const vid = currentUrl.searchParams.get("v");

      const playerEl = document.querySelector("#movie_player");
      if (playerEl && typeof playerEl.getPlayerResponse === "function") {
        const resp = playerEl.getPlayerResponse();
        if (resp && resp.streamingData) {
          const activeVid = resp.videoDetails?.videoId;
          if (activeVid && (!vid || activeVid === vid)) {
            parseStreamingData(resp.streamingData, resp.videoDetails);
          }
        }
      }

      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.streamingData) {
        const initVid = window.ytInitialPlayerResponse.videoDetails?.videoId;
        if (!vid || initVid === vid) {
          parseStreamingData(
            window.ytInitialPlayerResponse.streamingData,
            window.ytInitialPlayerResponse.videoDetails
          );
        }
      }

      if (vid && vid !== lastFetchedVisionVideoId) {
        fetchVisionOsStreams(vid);
      }
    } catch (e) {}
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (url && url.includes("/youtubei/v1/player")) {
          let vid = "";
          try {
            if (args[1] && args[1].body) {
              const bodyParsed = typeof args[1].body === "string" ? JSON.parse(args[1].body) : args[1].body;
              vid = bodyParsed.videoId;
            }
          } catch (e) {}

          if (!vid) {
            const currentUrl = new URL(location.href);
            vid = currentUrl.searchParams.get("v") || "";
          }

          if (vid && vid !== lastFetchedVisionVideoId) {
            fetchVisionOsStreams(vid);
          }

          const clone = response.clone();
          clone.json().then((data) => {
            if (data && data.streamingData) {
              parseStreamingData(data.streamingData, data.videoDetails);
            }
          }).catch(() => {});
        }
      } catch (err) {}
      return response;
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._udm_url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...rest) {
    this.addEventListener("load", function () {
      try {
        if (this._udm_url && this._udm_url.includes("/youtubei/v1/player")) {
          const currentUrl = new URL(location.href);
          const vid = currentUrl.searchParams.get("v") || "";
          if (vid && vid !== lastFetchedVisionVideoId) {
            fetchVisionOsStreams(vid);
          }

          const data = JSON.parse(this.responseText);
          if (data && data.streamingData) {
            parseStreamingData(data.streamingData, data.videoDetails);
          }
        }
      } catch (err) {}
    });
    return origSend.apply(this, rest);
  };

  window.addEventListener("message", (event) => {
    if (event.data && event.data.sender === "ULTRA_CONTENT") {
      if (event.data.action === "request_youtube_streams") {
        const currentUrl = new URL(location.href);
        const vid = currentUrl.searchParams.get("v") || "";
        if (vid) {
          lastFetchedVisionVideoId = "";
          fetchVisionOsStreams(vid);
          checkInitialPlayerResponse();
        }
      }
    }
  });

  window.addEventListener("yt-navigate-start", () => {
    lastFetchedVisionVideoId = "";
  });
  window.addEventListener("yt-navigate-finish", () => {
    lastFetchedVisionVideoId = "";
    checkInitialPlayerResponse();
  });

  checkInitialPlayerResponse();
  setInterval(checkInitialPlayerResponse, 2500);
})();
