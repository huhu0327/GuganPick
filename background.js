"use strict";

importScripts("core.js");

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "OPEN_ITEM") return;
  const parsed = GuganPickCore.parseSoopUrl(message.url);
  if (!parsed || !Number.isInteger(message.index) || message.index < 0) return;

  chrome.storage.local.set({ activeIndex: message.index }).then(() => {
    if (message.sameTab && sender.tab?.id) chrome.tabs.update(sender.tab.id, { url: parsed.url });
    else chrome.tabs.create({ url: parsed.url });
  });
});
