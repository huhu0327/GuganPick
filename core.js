(function (root) {
  "use strict";

  const ALLOWED_HOSTS = new Set(["vod.sooplive.com", "vod.sooplive.co.kr"]);
  const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
  const RANGE_PATTERN = /(?:\(([^)\r\n]*)\)\s*)?\[\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*\]\s*~\s*\[\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*\]/;

  function parseTime(value) {
    const parts = String(value).split(":").map(Number);
    if ((parts.length !== 2 && parts.length !== 3) || parts.some(Number.isNaN)) return null;
    if (parts.slice(1).some((part) => part < 0 || part > 59) || parts[0] < 0) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function parseRange(text) {
    const range = parseRanges(text)[0];
    return range && !range.error ? range : null;
  }

  function parseRanges(text) {
    return [...String(text || "").matchAll(new RegExp(RANGE_PATTERN.source, "g"))].map((match) => {
      const title = match[1]?.trim() || "";
      const start = parseTime(match[2]);
      const end = parseTime(match[3]);
      return start !== null && end !== null && start < end
        ? { title, start, end }
        : { title, start: null, end: null, error: "시간 형식 또는 시작·종료 순서가 잘못됐습니다." };
    });
  }

  function hasRangeSyntax(text) {
    return RANGE_PATTERN.test(String(text || ""));
  }

  function trimUrl(raw) {
    return String(raw || "").trim().replace(/[),.\]}>!?]+$/g, "");
  }

  function parseSoopUrl(raw) {
    try {
      const url = new URL(trimUrl(raw));
      const host = url.hostname.toLowerCase();
      const match = url.pathname.match(/^\/player\/(\d+)(\/catch)?\/?$/i);
      if (!ALLOWED_HOSTS.has(host) || !match || !/^https?:$/.test(url.protocol)) return null;

      const startValue = url.searchParams.has("change_second")
        ? url.searchParams.get("change_second")
        : url.searchParams.get("start");
      const start = startValue !== null && Number.isFinite(Number(startValue)) && Number(startValue) >= 0
        ? Number(startValue)
        : null;

      url.hash = "";
      return {
        url: url.href,
        videoKey: `${match[1]}${match[2] ? "/catch" : ""}`,
        start
      };
    } catch {
      return null;
    }
  }

  function extractSoopUrls(text) {
    return [...String(text || "").matchAll(URL_PATTERN)]
      .map((match) => parseSoopUrl(match[0]))
      .filter(Boolean);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const value = Math.floor(seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function itemKey(item) {
    return `${item.videoKey}|${item.start ?? ""}|${item.end ?? ""}`;
  }

  function sameSoopAuthor(publisher, commenter) {
    const identity = (author) => {
      const value = typeof author === "string" ? { name: author } : author || {};
      const text = String(value.name || "").replace(/\s+/g, " ").trim();
      const match = text.match(/^(.*?)\s*\(\s*([^()]+?)\s*\)$/);
      return {
        id: String(value.id || match?.[2] || "").trim().toLowerCase(),
        name: String(match?.[1] || text).trim().toLowerCase()
      };
    };
    const left = identity(publisher);
    const right = identity(commenter);
    if (left.id && right.id) return left.id === right.id;
    return Boolean(left.name && left.name === right.name);
  }

  function hasWatchedMarker(text) {
    return String(text || "").includes("[봤]");
  }

  function isPlayableRange(item) {
    return Boolean(item && item.status !== "error" && !item.watched
      && Number.isFinite(item.start) && Number.isFinite(item.end));
  }

  function nextPlayableIndex(entries, currentIndex) {
    const position = entries.findIndex((entry) => entry.index === currentIndex);
    return entries.slice(position + 1).find((entry) => isPlayableRange(entry.item))?.index ?? -1;
  }

  function activeRangeIndex(items, currentTime, preferredIndex, videoKey) {
    if (!Number.isFinite(currentTime)) return -1;
    const preferred = items[preferredIndex];
    const contains = (item) => item?.videoKey === videoKey && isPlayableRange(item)
      && item.start <= currentTime && currentTime < item.end;
    if (Number.isInteger(preferredIndex) && contains(items[preferredIndex])) return preferredIndex;
    if (preferred?.videoKey === videoKey && preferred.status === "completed"
      && Number.isFinite(preferred.end) && currentTime >= preferred.end - 0.05) return preferredIndex;
    const currentIndex = items.findIndex(contains);
    if (currentIndex >= 0) return currentIndex;
    return -1;
  }

  const api = { activeRangeIndex, extractSoopUrls, formatTime, hasRangeSyntax, hasWatchedMarker, isPlayableRange, itemKey, nextPlayableIndex, parseRange, parseRanges, parseSoopUrl, parseTime, sameSoopAuthor };
  root.GuganPickCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
