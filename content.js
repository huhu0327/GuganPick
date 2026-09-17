(() => {
  "use strict";

  const core = globalThis.GuganPickCore;
  const settingsApi = globalThis.GuganPickSettings;
  const isCafe = location.hostname === "cafe.naver.com";
  const isSoop = ["vod.sooplive.com", "vod.sooplive.co.kr"].includes(location.hostname);
  const STATUS = {
    waiting: "대기",
    preparing: "본편 준비 중",
    ad: "광고 종료 대기",
    playing: "재생 중",
    paused: "일시정지",
    completed: "완료",
    unspecified: "구간 미지정",
    error: "오류"
  };

  let host;
  let shadow;
  let items = [];
  let activeIndex = -1;
  let scope = "both";
  let settings = settingsApi.normalize();
  let mediaCleanup = () => {};
  let highlightCleanup = () => {};
  let playerToken = 0;
  let commentFingerprint = null;

  const $ = (selector) => shadow?.querySelector(selector);

  function create(tag, properties = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(properties)) {
      if (value === null || value === false) continue;
      if (name === "className") node.className = value;
      else if (name === "text") node.textContent = value;
      else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  }

  function statusText(item) {
    return item.error || STATUS[item.status] || STATUS.waiting;
  }

  function timeText(item) {
    if (item.end !== null) return `(${core.formatTime(item.start)}) ~ (${core.formatTime(item.end)})`;
    if (item.start !== null) return `${core.formatTime(item.start)}부터`;
    return "전체 재생 (구간 미지정)";
  }

  function itemText(item) {
    return `${item.title ? `${item.title} ` : ""}${timeText(item)}`;
  }

  function highlightedIndex() {
    const video = currentVideo();
    const current = core.parseSoopUrl(location.href);
    const ad = document.querySelector("#adVideo");
    if (!video || !current || (ad && !ad.paused && !ad.ended && ad.readyState >= 2)) return -1;
    return core.activeRangeIndex(items, video.currentTime, activeIndex, current.videoKey);
  }

  function updateHighlight() {
    const highlighted = highlightedIndex();
    shadow?.querySelectorAll("[data-item-index]").forEach((row) => {
      row.classList.toggle("active", Number(row.getAttribute("data-item-index")) === highlighted);
    });
  }

  function watchHighlight() {
    highlightCleanup();
    const video = currentVideo();
    const ad = document.querySelector("#adVideo");
    if (!video) return;
    const events = ["timeupdate", "seeked", "loadedmetadata"];
    events.forEach((event) => video.addEventListener(event, updateHighlight));
    ["play", "pause", "ended"].forEach((event) => ad?.addEventListener(event, updateHighlight));
    highlightCleanup = () => {
      events.forEach((event) => video.removeEventListener(event, updateHighlight));
      ["play", "pause", "ended"].forEach((event) => ad?.removeEventListener(event, updateHighlight));
    };
    updateHighlight();
  }

  function ensurePanel() {
    if (host) return true;
    if (isCafe && !document.querySelector(".se-main-container, #postViewArea, .CommentItem, .comment_box, [data-linktype='oglink']")) return false;

    host = document.createElement("div");
    host.id = "guganpick-extension";
    shadow = host.attachShadow({ mode: "open" });
    shadow.append(create("style", { text: `
      :host { all: initial; }
      .panel { position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; border: 1px solid #30363d; border-radius: 14px; background: #111418; color: #f4f6f8; box-shadow: 0 12px 40px #0008; font: 13px/1.45 system-ui, sans-serif; }
      header { position: sticky; top: 0; display: flex; align-items: center; gap: 8px; padding: 12px; background: #111418ee; border-bottom: 1px solid #30363d; backdrop-filter: blur(8px); }
      h2 { flex: 1; margin: 0; font-size: 15px; }
      button, select { border: 1px solid #46505a; border-radius: 8px; background: #222830; color: inherit; padding: 7px 9px; font: inherit; cursor: pointer; }
      button:hover { background: #303944; }
      button.primary { border-color: #168f51; background: #087c3f; }
      button:disabled { cursor: default; opacity: .45; }
      .tools, .controls { display: flex; gap: 6px; padding: 10px 12px; }
      .tools select { flex: 1; }
      .controls button { flex: 1; }
      ol { margin: 0; padding: 0 12px 4px; list-style: none; }
      li { margin: 0 0 8px; padding: 10px; border: 1px solid #30363d; border-radius: 10px; background: #191e24; }
      li.active { border-color: #21b66f; background: #123323; }
      .row { display: flex; align-items: start; gap: 8px; }
      .item-main { flex: 1; min-width: 0; }
      .title { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .meta { margin-top: 3px; color: #aeb7c2; font-size: 12px; }
      .state { color: #61d897; }
      .error { color: #ff8989; }
      .current { padding: 12px; }
      .empty, footer { padding: 12px; color: #aeb7c2; }
      footer { border-top: 1px solid #30363d; font-size: 11px; }
    ` }));
    document.documentElement.append(host);
    return true;
  }

  async function loadSettings() {
    const state = await chrome.storage.local.get("settings");
    settings = settingsApi.normalize(state.settings);
    scope = settings.scanScope;
  }

  async function togglePanel() {
    await loadSettings();
    if (!ensurePanel()) return;
    if (shadow.querySelector(".panel")) {
      highlightCleanup();
      host.remove();
      host = null;
      shadow = null;
      return;
    }
    if (isCafe) scanCafe();
    else loadState(true);
  }

  function panelHeader() {
    return create("header", {}, [
      create("h2", { text: "SOOP 구간 재생" }),
      create("button", { type: "button", title: "닫기", text: "닫기", onclick: togglePanel })
    ]);
  }

  function render(note = "") {
    if (!ensurePanel()) return;
    shadow.querySelector(".panel")?.remove();
    const panel = create("section", { className: "panel", role: "dialog", "aria-label": "SOOP 구간 재생 목록" });
    panel.append(panelHeader());

    if (isCafe) {
      const select = create("select", { "aria-label": "검색 범위" }, [
        create("option", { value: "both", text: "본문 + 현재 댓글" }),
        create("option", { value: "body", text: "본문" }),
        create("option", { value: "comments", text: "현재 댓글" })
      ]);
      select.value = scope;
      select.addEventListener("change", () => {
        scope = select.value;
        settings = { ...settings, scanScope: scope };
        chrome.storage.local.set({ settings });
      });
      panel.append(create("div", { className: "tools" }, [
        select,
        create("button", { type: "button", className: "primary", text: "다시 검색", onclick: scanCafe })
      ]));
    }

    const currentVideoKey = isSoop ? core.parseSoopUrl(location.href)?.videoKey : null;
    const currentItems = items.map((item, index) => ({ item, index })).filter(({ item }) => item.videoKey === currentVideoKey);
    if (isSoop) {
      if (!currentItems.length) panel.append(create("div", { className: "empty", text: note || "발견한 SOOP 구간이 없습니다." }));
      else {
        const list = create("ol");
        let segmentNumber = 0;
        const highlighted = highlightedIndex();
        currentItems.forEach(({ item, index }) => {
          const validRange = item.status !== "error" && Number.isFinite(item.start) && Number.isFinite(item.end);
          const number = validRange ? `${++segmentNumber}. ` : "";
          const details = [create("div", { className: "title", text: `${number}${itemText(item)}` })];
          details.push(create("div", { className: "meta", text: `${item.source}${item.author ? ` · ${item.author}` : ""}` }));
          details.push(create("div", { className: item.status === "error" ? "meta error" : "meta state", text: statusText(item) }));
          const play = create("button", { type: "button", text: "재생", onclick: () => playItem(index), disabled: item.status === "error" ? "" : null });
          list.append(create("li", { className: index === highlighted ? "active" : "", "data-item-index": index }, [
            create("div", { className: "row" }, [create("div", { className: "item-main" }, details), play])
          ]));
        });
        panel.append(list);
      }
    } else if (!items.length) panel.append(create("div", { className: "empty", text: note || "발견한 SOOP 영상이 없습니다." }));
    else {
      const list = create("ol");
      items.forEach((item, index) => {
        const stateClass = item.status === "error" ? "meta error" : "meta state";
        const details = [create("div", { className: "title", text: `${index + 1}. ${itemText(item)}` })];
        details.push(create("div", { className: "meta", text: `${item.source}${item.author ? ` · ${item.author}` : ""}` }));
        details.push(create("div", { className: stateClass, text: statusText(item) }));
        const main = create("div", { className: "item-main" }, details);
        const play = create("button", { type: "button", text: "재생", onclick: () => playItem(index), disabled: item.status === "error" ? "" : null });
        list.append(create("li", { className: index === activeIndex ? "active" : "" }, [create("div", { className: "row" }, [main, play])]));
      });
      panel.append(list);
    }

    if (isSoop && currentItems.length) {
      const paused = currentVideo()?.paused ?? items[activeIndex]?.status === "paused";
      panel.append(create("div", { className: "controls" }, [
        create("button", { type: "button", text: "이전", onclick: () => move(-1), disabled: activeIndex <= 0 ? "" : null }),
        create("button", { type: "button", text: paused ? "이어서 재생" : "일시정지", onclick: togglePauseCurrent }),
        create("button", { type: "button", text: "다음", onclick: () => move(1), disabled: activeIndex >= items.length - 1 ? "" : null })
      ]));
    }

    panel.append(create("footer", { text: note || (isCafe ? "현재 로드된 본문·댓글만 검색합니다." : "광고 종료 후 본편 #video를 제어합니다.") }));
    shadow.append(panel);
    if (isSoop) watchHighlight();
  }

  function closestContext(element, scopeElement) {
    if (scopeElement.matches(".CommentItem, .comment_box, li[class*='CommentItem']")) return scopeElement;
    return element.closest(".se-component, .CommentItem, .comment_box, li, p, article") || element.parentElement || scopeElement;
  }

  function authorOf(element) {
    return element.querySelector?.(".comment_nickname, .nickname, [class*='nickname']")?.textContent?.trim() || "";
  }

  function addCandidates(scopeElement, source, output) {
    const values = [];
    scopeElement.querySelectorAll("a[href], iframe[src], [data-linkdata]").forEach((element) => {
      const raw = element.getAttribute("href") || element.getAttribute("src") || element.getAttribute("data-linkdata") || "";
      const urls = core.extractSoopUrls(raw);
      if (!urls.length) return;
      values.push({ element, urls });
    });

    const walker = document.createTreeWalker(scopeElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const urls = core.extractSoopUrls(walker.currentNode.nodeValue);
      if (urls.length) values.push({ element: walker.currentNode.parentElement, urls });
    }

    values.forEach(({ element, urls }) => {
      const context = closestContext(element, scopeElement);
      const ranges = core.parseRanges(context.textContent);
      urls.forEach((parsed) => (ranges.length ? ranges : [null]).forEach((range) => output.push({
        id: crypto.randomUUID(),
        url: parsed.url,
        videoKey: parsed.videoKey,
        title: range?.title || "",
        start: range ? range.start : parsed.start,
        end: range?.end ?? null,
        source,
        author: source === "본문" ? "" : authorOf(context),
        status: range?.error ? "error" : range || parsed.start !== null ? "waiting" : "unspecified",
        error: range?.error || ""
      })));
    });
  }

  async function scanCafe() {
    if (!ensurePanel()) return;
    const found = [];
    if (scope !== "comments") {
      const body = document.querySelector(".se-main-container, #postViewArea, [data-linktype='oglink']")?.closest(".se-main-container, #postViewArea")
        || document.querySelector(".se-main-container, #postViewArea");
      if (body) addCandidates(body, "본문", found);
    }
    if (scope !== "body") {
      document.querySelectorAll(".CommentItem, .comment_box, li[class*='CommentItem']")
        .forEach((comment) => addCandidates(comment, "댓글", found));
    }

    const unique = new Map();
    found.forEach((item) => {
      const key = core.itemKey(item);
      if (!unique.has(key)) unique.set(key, item);
    });
    items = [...unique.values()];
    activeIndex = -1;
    await chrome.storage.local.set({ items, activeIndex });
    render(items.length ? `${items.length}개 항목 · 현재 로드된 범위` : "선택한 범위에서 SOOP 영상을 찾지 못했습니다.");
  }

  function soopCommentItems(current) {
    return [...document.querySelectorAll("[id^='txtComment']")].flatMap((comment) => {
      const author = comment.closest("li")?.querySelector("[id^='comment_']")?.textContent?.replace(/\s+/g, " ").trim() || "";
      return core.parseRanges(comment.textContent).map((range) => ({
        id: crypto.randomUUID(), url: current.url, videoKey: current.videoKey,
        title: range.title, start: range.start, end: range.end,
        source: "SOOP 댓글", author,
        status: range.error ? "error" : "waiting",
        error: range.error || ""
      }));
    });
  }

  function commentState() {
    const area = document.querySelector("#commentHighlight, .commentHighlight");
    if (!area) return null;
    const comments = [...area.querySelectorAll("[id^='txtComment']")];
    const countMatch = document.querySelector("#cmmtOpener")?.textContent?.match(/[\d,]+/);
    const expectedCount = countMatch ? Number(countMatch[0].replaceAll(",", "")) : null;
    if (!comments.length && expectedCount !== 0) return null;
    return comments
      .map((comment) => `${comment.id}:${comment.textContent}`).join("\n");
  }

  function watchSoopComments() {
    commentFingerprint = commentState();
    let timer;
    new MutationObserver(() => {
      const next = commentState();
      if (next === null || next === commentFingerprint) return;
      commentFingerprint = next;
      clearTimeout(timer);
      timer = setTimeout(() => loadState(Boolean(host)), 100);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  async function loadState(show = false) {
    const state = await chrome.storage.local.get(["items", "activeIndex"]);
    items = Array.isArray(state.items) ? state.items : [];
    activeIndex = Number.isInteger(state.activeIndex) ? state.activeIndex : -1;

    if (isSoop) {
      const current = core.parseSoopUrl(location.href);
      let matching = -1;
      if (current) {
        const keyOf = (item) => item.status === "error"
          ? `${core.itemKey(item)}|error|${item.author}|${item.title}`
          : core.itemKey(item);
        const selectedKey = items[activeIndex]?.videoKey === current.videoKey ? keyOf(items[activeIndex]) : null;
        const comments = soopCommentItems(current);
        const commentsLoaded = commentState() !== null;
        const previousComments = new Map(items
          .filter((item) => item.videoKey === current.videoKey && item.source === "SOOP 댓글")
          .map((item) => [keyOf(item), item]));
        if (commentsLoaded) {
          items = items.filter((item) => item.videoKey !== current.videoKey
            || (item.source !== "SOOP 댓글" && item.source !== "현재 SOOP 페이지"));
        }
        const unique = new Map(items.map((item) => [keyOf(item), item]));
        if (commentsLoaded) comments.forEach((item) => {
          if (!unique.has(keyOf(item))) unique.set(keyOf(item), previousComments.get(keyOf(item)) || item);
        });
        items = [...unique.values()];
        matching = selectedKey ? items.findIndex((item) => keyOf(item) === selectedKey) : -1;
        if (matching < 0 && commentsLoaded && comments.length) {
          matching = items.findIndex((item) => keyOf(item) === keyOf(comments[0]));
        }
        if (matching < 0) matching = items.findIndex((item) => item.videoKey === current.videoKey);
        if (matching < 0) {
          matching = items.length;
          items.push({
            id: crypto.randomUUID(), url: current.url, videoKey: current.videoKey, title: "",
            start: current.start, end: null, source: "현재 SOOP 페이지", author: "",
            status: current.start === null ? "unspecified" : "waiting", error: ""
          });
        }
        activeIndex = matching;
        await chrome.storage.local.set({ items, activeIndex });
      }
      if (matching >= 0) show = show || settings.autoOpenPanel;
    }

    if (show && ensurePanel()) render();
  }

  async function saveStatus(index, status, error = "") {
    if (!items[index]) return;
    if (items[index].status === status && items[index].error === error) return;
    items[index] = { ...items[index], status, error };
    await chrome.storage.local.set({ items });
  }

  function playItem(index) {
    const item = items[index];
    if (!item || item.status === "error") return;
    const current = core.parseSoopUrl(location.href);
    if (isSoop && current?.videoKey === item.videoKey) startPlayback(index);
    else chrome.runtime.sendMessage({
      type: "OPEN_ITEM",
      index,
      url: item.url,
      sameTab: isSoop || !settings.openInNewTab
    });
  }

  async function startPlayback(index) {
    mediaCleanup();
    const token = ++playerToken;
    activeIndex = index;
    await chrome.storage.local.set({ activeIndex });
    await saveStatus(index, "preparing");

    const deadline = Date.now() + 60000;
    const poll = setInterval(async () => {
      if (token !== playerToken) return clearInterval(poll);
      const ad = document.querySelector("#adVideo");
      const adActive = ad && !ad.paused && !ad.ended && ad.readyState >= 2;
      if (adActive) return saveStatus(index, "ad");

      const video = document.querySelector("video#video") || [...document.querySelectorAll("video")].find((node) => node.id !== "adVideo");
      if (!video || video.readyState < 1) {
        if (Date.now() > deadline) {
          clearInterval(poll);
          saveStatus(index, "error", "본편을 60초 안에 찾지 못했습니다.");
        }
        return;
      }
      clearInterval(poll);
      attachMedia(video, index);
    }, 500);
    mediaCleanup = () => clearInterval(poll);
  }

  async function attachMedia(video, index) {
    const item = items[index];
    const start = item.start ?? 0;
    if ((Number.isFinite(video.duration) && start >= video.duration) || (item.end !== null && Number.isFinite(video.duration) && item.end > video.duration)) {
      return saveStatus(index, "error", `영상 길이(${core.formatTime(video.duration)})를 벗어난 구간입니다.`);
    }

    let completed = false;
    let stoppedAtEnd = false;
    const onTime = () => {
      if (!completed && item.end !== null && video.currentTime >= item.end - 0.05) {
        completed = true;
        saveStatus(index, "completed");
        const action = settingsApi.endAction(settings, index < items.length - 1);
        if (action === "continue") return;
        stoppedAtEnd = true;
        video.pause();
        if (action === "next") playItem(index + 1);
      }
    };
    const onPlaying = () => saveStatus(index, "playing");
    const onWaiting = () => saveStatus(index, "preparing");
    const onPause = () => { if (!stoppedAtEnd) saveStatus(index, "paused"); };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    mediaCleanup = () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
    };

    try {
      video.currentTime = start;
      await video.play();
    } catch {
      await saveStatus(index, "paused", "브라우저가 자동 재생을 막았습니다. SOOP 재생 버튼 후 다시 누르세요.");
    }
  }

  function currentVideo() {
    return document.querySelector("video#video") || [...document.querySelectorAll("video")].find((node) => node.id !== "adVideo");
  }

  async function togglePauseCurrent() {
    const video = currentVideo();
    if (!video) return;
    if (!video.paused) {
      video.pause();
      render();
      return;
    }
    try {
      await video.play();
      render();
    } catch {
      if (activeIndex >= 0) await saveStatus(activeIndex, "paused", "브라우저가 재생을 막았습니다. SOOP 재생 버튼 후 다시 누르세요.");
      render();
    }
  }

  function move(direction) {
    const index = activeIndex + direction;
    if (index >= 0 && index < items.length) playItem(index);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_PANEL") void togglePanel();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      settings = settingsApi.normalize(changes.settings.newValue);
      scope = settings.scanScope;
    }
    if (!host) return;
    if (changes.items) items = changes.items.newValue || [];
    if (changes.activeIndex) activeIndex = changes.activeIndex.newValue ?? -1;
    render();
  });

  if (isSoop && window === window.top) loadSettings().then(async () => {
    await loadState(false);
    watchSoopComments();
  });
})();
