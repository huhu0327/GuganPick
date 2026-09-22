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
  let promptCleanup = () => {};
  let highlightCleanup = () => {};
  let renderTimer = 0;
  let playerToken = 0;
  let commentFingerprint = null;
  let autoPlayedVideoKey = null;

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

  function showNextPrompt(onNext) {
    promptCleanup();
    const prompt = document.createElement("div");
    prompt.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;pointer-events:none";
    const root = prompt.attachShadow({ mode: "open" });
    const next = create("button", { type: "button", text: "재생" });
    const close = create("button", { type: "button", text: "취소" });
    root.append(create("style", { text: `
      section { min-width: 240px; padding: 18px; border: 1px solid #46505a; border-radius: 12px; background: #111418ee; color: #f4f6f8; box-shadow: 0 12px 40px #000a; text-align: center; font: 14px/1.45 system-ui, sans-serif; pointer-events: auto; }
      strong { display: block; margin-bottom: 14px; }
      div { display: flex; gap: 8px; }
      button { flex: 1; min-height: 44px; padding: 8px 12px; border: 1px solid #46505a; border-radius: 8px; background: #222830; color: inherit; font: inherit; cursor: pointer; }
      button:first-child { border-color: #168f51; background: #087c3f; }
    ` }), create("section", { role: "dialog", "aria-modal": "true", "aria-label": "다음 구간 재생 확인" }, [
      create("strong", { text: "다음 구간을 재생할까요?" }),
      create("div", {}, [next, close])
    ]));
    const dismiss = () => {
      prompt.remove();
      document.removeEventListener("keydown", onKeydown);
      promptCleanup = () => {};
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") dismiss();
    };
    next.addEventListener("click", () => { dismiss(); onNext(); });
    close.addEventListener("click", dismiss);
    (document.fullscreenElement || document.documentElement).append(prompt);
    promptCleanup = dismiss;
    document.addEventListener("keydown", onKeydown);
    next.focus();
  }

  function timeText(item) {
    if (item.end !== null) return `(${core.formatTime(item.start)}) ~ (${core.formatTime(item.end)})`;
    if (item.start !== null) return `${core.formatTime(item.start)}부터`;
    return "전체 재생 (구간 미지정)";
  }

  function itemText(item) {
    return `${item.title ? `${item.title} ` : ""}${timeText(item)}`;
  }

  function currentSoopItems() {
    const videoKey = isSoop ? core.parseSoopUrl(location.href)?.videoKey : null;
    return items.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.videoKey === videoKey && item.source === "SOOP 댓글");
  }

  function highlightedIndex() {
    const video = currentVideo();
    const current = core.parseSoopUrl(location.href);
    const ad = document.querySelector("#adVideo");
    if (!video || !current || (ad && !ad.paused && !ad.ended && ad.readyState >= 2)) return -1;
    const currentItems = currentSoopItems();
    const preferred = currentItems.findIndex(({ index }) => index === activeIndex);
    const highlighted = core.activeRangeIndex(currentItems.map(({ item }) => item), video.currentTime, preferred, current.videoKey);
    return highlighted < 0 ? -1 : currentItems[highlighted].index;
  }

  function updateHighlight() {
    const video = currentVideo();
    const selected = items[activeIndex];
    if (video && selected?.status !== "completed" && Number.isFinite(selected?.end)
      && video.currentTime >= selected.end - 0.05) void saveStatus(activeIndex, "completed");
    const highlighted = highlightedIndex();
    if (highlighted >= 0 && highlighted !== activeIndex) {
      activeIndex = highlighted;
      void chrome.storage.local.set({ activeIndex, activeVideoKey: core.parseSoopUrl(location.href)?.videoKey || null });
      if (items[highlighted]?.status !== "completed") {
        void saveStatus(highlighted, currentVideo()?.paused ? "paused" : "playing");
      }
    }
    shadow?.querySelectorAll("[data-item-index]").forEach((row) => {
      const active = Number(row.getAttribute("data-item-index")) === highlighted;
      row.classList.toggle("active", active);
      if (active) {
        const state = row.querySelector(".state");
        if (state) state.textContent = statusText(items[highlighted]);
      }
    });
    const toggle = shadow?.querySelector("[data-playback-toggle]");
    if (toggle) toggle.textContent = currentVideo()?.paused === false ? "일시정지" : "이어서 재생";
  }

  function syncMediaStatus(status) {
    const index = highlightedIndex();
    const video = currentVideo();
    const item = items[index];
    const completedAtEnd = item?.status === "completed"
      && item.end !== null && video?.currentTime >= item.end - 0.05;
    if (index >= 0 && !completedAtEnd) void saveStatus(index, status);
    updateHighlight();
  }

  function watchHighlight() {
    highlightCleanup();
    const video = currentVideo();
    const ad = document.querySelector("#adVideo");
    if (!video) return;
    const syncCurrentStatus = () => syncMediaStatus(video.paused ? "paused" : "playing");
    const onPlaying = () => syncMediaStatus("playing");
    const onWaiting = () => syncMediaStatus("preparing");
    const onPause = () => syncMediaStatus("paused");
    video.addEventListener("timeupdate", updateHighlight);
    video.addEventListener("seeked", updateHighlight);
    video.addEventListener("loadedmetadata", syncCurrentStatus);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    ["play", "pause", "ended"].forEach((event) => ad?.addEventListener(event, syncCurrentStatus));
    highlightCleanup = () => {
      video.removeEventListener("timeupdate", updateHighlight);
      video.removeEventListener("seeked", updateHighlight);
      video.removeEventListener("loadedmetadata", syncCurrentStatus);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
      ["play", "pause", "ended"].forEach((event) => ad?.removeEventListener(event, syncCurrentStatus));
    };
    syncCurrentStatus();
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
      .segment-list { padding-top: 12px; }
      .segment-list-wrap { position: relative; }
      .segment-list-wrap.watched .segment-list { pointer-events: none; }
      li { margin: 0 0 8px; padding: 10px; border: 1px solid #30363d; border-radius: 10px; background: #191e24; }
      .watched-overlay { position: absolute; z-index: 1; inset: 12px 12px 12px; display: grid; place-items: center; border-radius: 10px; background: #000b; color: #fff; font-size: 18px; font-weight: 800; }
      li.active { border-color: #21b66f; background: #123323; }
      .row { display: flex; align-items: start; gap: 8px; }
      .item-main { flex: 1; min-width: 0; }
      .title { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .meta { margin-top: 3px; color: #aeb7c2; font-size: 12px; }
      .timestamps { display: flex; align-items: center; gap: 5px; }
      .timestamp { padding: 1px 4px; border: 0; background: transparent; color: #aeb7c2; font-size: 12px; text-decoration: underline; }
      .timestamp:hover { background: #303944; color: #fff; }
      .state { color: #61d897; }
      .segment-list li:not(.active) .state { display: none; }
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
      promptCleanup();
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

    const currentItems = currentSoopItems();
    if (isSoop) {
      if (!currentItems.length) panel.append(create("div", { className: "empty", text: note || "발견한 SOOP 구간이 없습니다." }));
      else {
        const list = create("ol", { className: "segment-list" });
        const watched = currentItems.some(({ item }) => item.watched);
        if (watched) list.setAttribute("inert", "");
        let segmentNumber = 0;
        const highlighted = highlightedIndex();
        currentItems.forEach(({ item, index }) => {
          const validRange = item.status !== "error" && Number.isFinite(item.start) && Number.isFinite(item.end);
          const blocked = item.status === "error" || item.watched;
          const number = validRange ? `${++segmentNumber}. ` : "";
          const details = [create("div", { className: "title", text: `${number}${item.title || ""}`.trim() })];
          if (validRange) details.push(create("div", { className: "meta timestamps" }, [
            create("button", { type: "button", className: "timestamp", text: `(${core.formatTime(item.start)})`, "aria-label": `${core.formatTime(item.start)}부터 재생`, onclick: () => startPlayback(index, item.start), disabled: blocked ? "" : null }),
            create("span", { text: "~" }),
            create("button", { type: "button", className: "timestamp", text: `(${core.formatTime(item.end)})`, "aria-label": `${core.formatTime(item.end)}부터 재생`, onclick: () => startPlayback(index, item.end), disabled: blocked ? "" : null })
          ]));
          details.push(create("div", { className: item.status === "error" ? "meta error" : "meta state", text: statusText(item) }));
          const play = create("button", { type: "button", text: "재생", onclick: () => playItem(index), disabled: blocked ? "" : null });
          const row = create("div", { className: "row" }, [create("div", { className: "item-main" }, details), play]);
          list.append(create("li", {
            className: index === highlighted ? "active" : "",
            "data-item-index": index
          }, [row]));
        });
        const listWrap = create("div", {
          className: `segment-list-wrap${watched ? " watched" : ""}`,
          "aria-label": watched ? "구간 전체 봤" : null
        }, [list]);
        if (watched) listWrap.append(create("div", { className: "watched-overlay", text: "- 봤 -" }));
        panel.append(listWrap);
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
      const playableIndices = currentItems.filter(({ item }) => core.isPlayableRange(item)).map(({ index }) => index);
      const currentPosition = playableIndices.indexOf(activeIndex);
      panel.append(create("div", { className: "controls" }, [
        create("button", { type: "button", text: "이전", onclick: () => move(-1), disabled: currentPosition <= 0 ? "" : null }),
        create("button", { type: "button", text: paused ? "이어서 재생" : "일시정지", onclick: togglePauseCurrent, "data-playback-toggle": "" }),
        create("button", { type: "button", text: "다음", onclick: () => move(1), disabled: currentPosition >= playableIndices.length - 1 ? "" : null })
      ]));
    }

    if (isCafe) panel.append(create("footer", { text: note || "현재 로드된 본문·댓글만 검색합니다." }));
    shadow.append(panel);
    if (isSoop) watchHighlight();
  }

  function scheduleRender() {
    if (!host) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      if (host) render();
    }, 50);
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

  function soopPublisher() {
    const container = document.querySelector("#player_area .column[number='1'], #webplayer_contents .column[number='1']");
    const link = container?.querySelector(".thumbnail_box a[href*='/station/']")
      || document.querySelector(".author_inner a[href*='/station/']");
    if (!link) return null;
    try {
      const match = new URL(link.href).pathname.match(/^\/station\/([^/]+)\/?$/i);
      if (!match) return null;
      return { id: decodeURIComponent(match[1]), name: (container || link.closest(".author_inner"))
        ?.querySelector(".nickname, .nick")?.textContent || "" };
    } catch {
      return null;
    }
  }

  function soopCommentAuthor(comment) {
    return comment.closest("li")?.querySelector("[id^='comment_']")?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function soopCommentItems(current, publisher) {
    const comments = [...document.querySelectorAll("[id^='txtComment']")]
      .map((comment) => ({ comment, author: soopCommentAuthor(comment) }))
      .filter(({ author }) => core.sameSoopAuthor(publisher, author));
    const watched = comments.some(({ comment }) => core.hasWatchedMarker(comment.textContent));
    return comments.flatMap(({ comment, author }) => {
      return core.parseRanges(comment.textContent).map((range) => ({
        id: crypto.randomUUID(), url: current.url, videoKey: current.videoKey,
        title: range.title, start: range.start, end: range.end,
        source: "SOOP 댓글", author, watched,
        status: range.error ? "error" : "waiting",
        error: range.error || ""
      }));
    });
  }

  function commentState() {
    const publisher = soopPublisher();
    if (!publisher) return null;
    const area = document.querySelector("#commentHighlight, .commentHighlight");
    if (!area) return null;
    const comments = [...area.querySelectorAll("[id^='txtComment']")];
    const countMatch = document.querySelector("#cmmtOpener, #catchCommentWrap .total b")?.textContent?.match(/[\d,]+/);
    const expectedCount = countMatch ? Number(countMatch[0].replaceAll(",", "")) : null;
    if (!comments.length && expectedCount !== 0) return null;
    return `${publisher.id}:${publisher.name}\n${comments
      .map((comment) => `${comment.id}:${soopCommentAuthor(comment)}:${comment.textContent}`).join("\n")}`;
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
    const state = await chrome.storage.local.get(["items", "activeIndex", "activeVideoKey"]);
    const current = isSoop ? core.parseSoopUrl(location.href) : null;
    items = Array.isArray(state.items) ? state.items : [];
    activeIndex = Number.isInteger(state.activeIndex)
      && (!isSoop || state.activeVideoKey === current?.videoKey) ? state.activeIndex : -1;

    if (isSoop) {
      let matching = -1;
      if (current) {
        const publisher = soopPublisher();
        const keyOf = (item) => item.status === "error"
          ? `${core.itemKey(item)}|error|${item.author}|${item.title}`
          : core.itemKey(item);
        const selected = items[activeIndex];
        const selectedKey = selected?.videoKey === current.videoKey && selected.source === "SOOP 댓글"
          && core.sameSoopAuthor(publisher, selected.author) ? keyOf(selected) : null;
        items = items.filter((item) => item.videoKey !== current.videoKey || item.source !== "SOOP 댓글"
          || core.sameSoopAuthor(publisher, item.author));
        const comments = soopCommentItems(current, publisher);
        const commentsLoaded = commentState() !== null;
        const previousComments = new Map(items
          .filter((item) => item.videoKey === current.videoKey && item.source === "SOOP 댓글")
          .map((item) => [keyOf(item), item]));
        items = items.filter((item) => item.videoKey !== current.videoKey || item.source !== "현재 SOOP 페이지");
        if (commentsLoaded) {
          items = items.filter((item) => item.videoKey !== current.videoKey || item.source !== "SOOP 댓글");
          const uniqueComments = new Map();
          comments.forEach((item) => {
            if (!uniqueComments.has(keyOf(item))) {
              const previous = previousComments.get(keyOf(item));
              uniqueComments.set(keyOf(item), previous ? { ...previous, watched: item.watched } : item);
            }
          });
          items.push(...uniqueComments.values());
        }
        matching = selectedKey ? items.findIndex((item) => item.videoKey === current.videoKey
          && item.source === "SOOP 댓글" && keyOf(item) === selectedKey) : -1;
        if (matching < 0 || !core.isPlayableRange(items[matching])) matching = items.findIndex((item) => item.videoKey === current.videoKey
          && item.source === "SOOP 댓글" && core.isPlayableRange(item));
        activeIndex = matching;
        await chrome.storage.local.set({ items, activeIndex, activeVideoKey: current.videoKey });
        show = show || settings.autoOpenPanel;
      }
    }

    if (show && ensurePanel()) render();
    const first = currentSoopItems().find(({ item }) => core.isPlayableRange(item));
    if (settings.autoPlayFirst && current && first && autoPlayedVideoKey !== current.videoKey) {
      autoPlayedVideoKey = current.videoKey;
      startPlayback(first.index);
    }
  }

  async function saveStatus(index, status, error = "") {
    if (!items[index]) return;
    if (items[index].status === status && items[index].error === error) return;
    items[index] = { ...items[index], status, error };
    await chrome.storage.local.set({ items });
  }

  function playItem(index) {
    const item = items[index];
    if (!item || item.status === "error" || item.watched) return;
    const current = core.parseSoopUrl(location.href);
    if (isSoop && current?.videoKey === item.videoKey) startPlayback(index);
    else chrome.runtime.sendMessage({
      type: "OPEN_ITEM",
      index,
      url: item.url,
      sameTab: isSoop || !settings.openInNewTab
    });
  }

  function startPlayback(index, startAt = items[index]?.start ?? 0) {
    if (!items[index] || items[index].status === "error" || items[index].watched) return;
    promptCleanup();
    mediaCleanup();
    const token = ++playerToken;
    const item = items[index];
    const start = startAt ?? 0;
    activeIndex = index;
    void chrome.storage.local.set({ activeIndex, activeVideoKey: item.videoKey || null });
    void saveStatus(index, "preparing");

    const deadline = Date.now() + 60000;
    let poll;
    const tryStart = () => {
      if (token !== playerToken) {
        if (poll) clearInterval(poll);
        return true;
      }
      const ad = document.querySelector("#adVideo");
      const adActive = ad && !ad.paused && !ad.ended && ad.readyState >= 2;
      if (adActive) {
        void saveStatus(index, "ad");
        return false;
      }

      const video = currentVideo();
      if (!video || video.readyState < 1) {
        if (Date.now() > deadline) {
          if (poll) clearInterval(poll);
          void saveStatus(index, "error", "본편을 60초 안에 찾지 못했습니다.");
          return true;
        }
        return false;
      }
      const duration = video.duration;
      const durationReady = Number.isFinite(duration) && duration > 0;
      const fitsDuration = durationReady && start < duration
        && (item?.end === null || item?.end <= duration);
      if (!fitsDuration) {
        void saveStatus(index, "preparing");
        if (Date.now() > deadline) {
          if (poll) clearInterval(poll);
          void saveStatus(index, "error", durationReady
            ? `영상 길이(${core.formatTime(duration)})를 벗어난 구간입니다.`
            : "본편 길이를 60초 안에 확인하지 못했습니다.");
          return true;
        }
        return false;
      }
      if (poll) clearInterval(poll);
      void attachMedia(video, index, startAt);
      return true;
    };
    if (tryStart()) return;
    poll = setInterval(tryStart, 500);
    mediaCleanup = () => clearInterval(poll);
  }

  async function attachMedia(video, index, startAt) {
    const item = items[index];
    const start = startAt ?? 0;

    const currentEntries = currentSoopItems();
    const lastEnd = currentEntries.filter(({ item }) => core.isPlayableRange(item)).at(-1)?.item.end ?? null;
    const pauseAtEnd = settings.pauseAtEnd;
    const stopAt = settingsApi.stopAt(settings, item.end, lastEnd);
    const nextIndex = core.nextPlayableIndex(currentEntries, index);
    let seekReady = false;
    let stopped = false;
    const onTime = () => {
      if (!seekReady) {
        if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - start) > 0.25) return;
        seekReady = true;
      }
      if (items[index]?.status !== "completed" && item.end !== null && video.currentTime >= item.end - 0.05) {
        saveStatus(index, "completed");
      }
      if (!stopped && stopAt !== null && video.currentTime >= stopAt - 0.05) {
        stopped = true;
        video.pause();
        if (pauseAtEnd && nextIndex >= 0) showNextPrompt(() => startPlayback(nextIndex));
      }
    };
    video.addEventListener("timeupdate", onTime);
    mediaCleanup = () => {
      video.removeEventListener("timeupdate", onTime);
    };

    try {
      video.currentTime = start;
      await video.play();
      if (Math.abs(video.currentTime - start) > 0.25) {
        video.currentTime = start;
        await video.play();
      }
    } catch {
      await saveStatus(index, "paused", "브라우저가 자동 재생을 막았습니다. SOOP 재생 버튼 후 다시 누르세요.");
    }
  }

  function currentVideo() {
    return document.querySelector("video#video, video#video_p");
  }

  async function togglePauseCurrent() {
    const video = currentVideo();
    if (!video) return;
    if (!video.paused) {
      video.pause();
      syncMediaStatus("paused");
      return;
    }
    try {
      await video.play();
      syncMediaStatus("playing");
    } catch {
      const index = highlightedIndex();
      if (index >= 0) await saveStatus(index, "paused", "브라우저가 재생을 막았습니다. SOOP 재생 버튼 후 다시 누르세요.");
      updateHighlight();
    }
  }

  function move(direction) {
    const indices = currentSoopItems()
      .filter(({ item }) => core.isPlayableRange(item))
      .map(({ index }) => index);
    const index = indices[indices.indexOf(activeIndex) + direction];
    if (Number.isInteger(index)) playItem(index);
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
    const currentKey = isSoop ? core.parseSoopUrl(location.href)?.videoKey : null;
    const selectionChanged = changes.activeIndex
      && (!isSoop || changes.activeVideoKey?.newValue === currentKey);
    if (selectionChanged) activeIndex = changes.activeIndex.newValue ?? -1;
    if (changes.items || selectionChanged) scheduleRender();
  });

  if (isSoop && window === window.top) loadSettings().then(async () => {
    await loadState(false);
    watchSoopComments();
  });
})();
