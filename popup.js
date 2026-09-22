"use strict";

const settingsApi = globalThis.GuganPickSettings;
const form = document.querySelector("#settings-form");
const openPanelButton = document.querySelector("#open-panel");
const status = document.querySelector("#status");
let currentSettings = settingsApi.normalize();

function readForm() {
  return {
    ...currentSettings,
    autoPlayFirst: form.autoPlayFirst.checked,
    pauseAtEnd: form.pauseAtEnd.checked,
    pauseAtLast: form.pauseAtLast.checked,
    openInNewTab: form.openInNewTab.checked,
    autoOpenPanel: form.autoOpenPanel.checked
  };
}

function writeForm(settings) {
  currentSettings = settingsApi.normalize(settings);
  form.autoPlayFirst.checked = currentSettings.autoPlayFirst;
  form.pauseAtEnd.checked = currentSettings.pauseAtEnd;
  form.pauseAtLast.checked = currentSettings.pauseAtLast;
  form.openInNewTab.checked = currentSettings.openInNewTab;
  form.autoOpenPanel.checked = currentSettings.autoOpenPanel;
}

function showStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

async function saveSettings() {
  try {
    currentSettings = readForm();
    await chrome.storage.local.set({ settings: currentSettings });
    showStatus("저장됨", "success");
  } catch {
    showStatus("설정을 저장하지 못했습니다. 다시 변경해 보세요.", "error");
  }
}

async function openCurrentPanel() {
  openPanelButton.disabled = true;
  openPanelButton.dataset.state = "loading";
  openPanelButton.querySelector(".button-label").textContent = "패널 여는 중…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("active-tab-missing");
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
    openPanelButton.dataset.state = "success";
    openPanelButton.querySelector(".button-label").textContent = "패널 열림";
    showStatus("현재 페이지에서 목록 패널을 열었습니다.", "success");
    setTimeout(() => window.close(), 350);
  } catch {
    openPanelButton.disabled = false;
    openPanelButton.dataset.state = "error";
    openPanelButton.querySelector(".button-label").textContent = "다시 시도";
    showStatus("네이버 카페 또는 SOOP 페이지에서 실행하세요.", "error");
  }
}

form.addEventListener("change", () => void saveSettings());
openPanelButton.addEventListener("click", () => void openCurrentPanel());

chrome.storage.local.get("settings").then(({ settings }) => {
  writeForm(settingsApi.normalize(settings));
});
