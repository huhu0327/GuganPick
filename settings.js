(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    autoPlayFirst: true,
    pauseAtEnd: true,
    pauseAtLast: true,
    scanScope: "both",
    openInNewTab: true,
    autoOpenPanel: true
  });
  const SCOPES = new Set(["both", "body", "comments"]);

  function normalize(value = {}) {
    return {
      autoPlayFirst: value.autoPlayFirst === undefined ? DEFAULTS.autoPlayFirst : value.autoPlayFirst === true,
      pauseAtEnd: value.pauseAtEnd === undefined ? DEFAULTS.pauseAtEnd : value.pauseAtEnd === true,
      pauseAtLast: value.pauseAtLast !== false,
      scanScope: SCOPES.has(value.scanScope) ? value.scanScope : DEFAULTS.scanScope,
      openInNewTab: value.openInNewTab !== false,
      autoOpenPanel: value.autoOpenPanel !== false
    };
  }

  function stopAt(settings, itemEnd, lastEnd) {
    const value = normalize(settings);
    if (value.pauseAtEnd) return itemEnd;
    return value.pauseAtLast ? lastEnd : null;
  }

  const api = { DEFAULTS, normalize, stopAt };
  root.GuganPickSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
