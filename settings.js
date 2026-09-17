(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    autoAdvance: false,
    pauseAtEnd: false,
    scanScope: "both",
    openInNewTab: true,
    autoOpenPanel: true
  });
  const SCOPES = new Set(["both", "body", "comments"]);

  function normalize(value = {}) {
    return {
      autoAdvance: value.autoAdvance === true,
      pauseAtEnd: value.pauseAtEnd === true,
      scanScope: SCOPES.has(value.scanScope) ? value.scanScope : DEFAULTS.scanScope,
      openInNewTab: value.openInNewTab !== false,
      autoOpenPanel: value.autoOpenPanel !== false
    };
  }

  function endAction(settings, hasNext) {
    const value = normalize(settings);
    if (value.autoAdvance) return hasNext ? "next" : "pause";
    return value.pauseAtEnd ? "pause" : "continue";
  }

  const api = { DEFAULTS, endAction, normalize };
  root.GuganPickSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
