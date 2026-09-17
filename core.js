(function (root) {
  "use strict";

  const ALLOWED_HOSTS = new Set(["vod.sooplive.com", "vod.sooplive.co.kr"]);
  const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
  const RANGE_PATTERN = /(?<!\d:)(\d{1,3}:\d{2}(?::\d{2})?)\s*(?:~|～|－|–|—|-)\s*(\d{1,3}:\d{2}(?::\d{2})?)(?!:\d)/;

  function parseTime(value) {
    const parts = String(value).split(":").map(Number);
    if ((parts.length !== 2 && parts.length !== 3) || parts.some(Number.isNaN)) return null;
    if (parts.slice(1).some((part) => part < 0 || part > 59) || parts[0] < 0) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function parseRange(text) {
    const match = String(text || "").match(RANGE_PATTERN);
    if (!match) return null;
    const start = parseTime(match[1]);
    const end = parseTime(match[2]);
    return start !== null && end !== null && start < end ? { start, end } : null;
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

      const changeSecond = url.searchParams.get("change_second");
      const start = changeSecond !== null && Number.isFinite(Number(changeSecond)) && Number(changeSecond) >= 0
        ? Number(changeSecond)
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

  const api = { extractSoopUrls, formatTime, hasRangeSyntax, itemKey, parseRange, parseSoopUrl, parseTime };
  root.GuganPickCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
