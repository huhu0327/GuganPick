(() => {
  "use strict";

  const core = globalThis.GuganPickCore;
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
  let mediaCleanup = () => {};
  let playerToken = 0;

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
    if (item.end !== null) return `${core.formatTime(item.start)} ~ ${core.formatTime(item.end)}`;
    if (item.start !== null) return `${core.formatTime(item.start)}부터`;
    return "전체 재생 (구간 미지정)";
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
      li.active { border-color: #21b66f; }
      .row { display: flex; align-items: start; gap: 8px; }
      .item-main { flex: 1; min-width: 0; }
      .title { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .meta { margin-top: 3px; color: #aeb7c2; font-size: 12px; }
      .state { color: #61d897; }
      .error { color: #ff8989; }
      .empty, footer { padding: 12px; color: #aeb7c2; }
      footer { border-top: 1px solid #30363d; font-size: 11px; }
    ` }));
    document.documentElement.append(host);
    return true;
  }

  function togglePanel() {
    if (!ensurePanel()) return;
    if (shadow.querySelector(".panel")) {
      host.remove();
      host = null;
      shadow = null;
      mediaCleanup();
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
      select.addEventListener("change", () => { scope = select.value; });
      panel.append(create("div", { className: "tools" }, [
        select,
        create("button", { type: "button", className: "primary", text: "다시 검색", onclick: scanCafe })
      ]));
    }

    if (!items.length) panel.append(create("div", { className: "empty", text: note || "발견한 SOOP 영상이 없습니다." }));
    else {
      const list = create("ol");
      items.forEach((item, index) => {
        const stateClass = item.status === "error" ? "meta error" : "meta state";
        const main = create("div", { className: "item-main" }, [
          create("div", { className: "title", text: `${index + 1}. ${item.title || "SOOP 영상"}` }),
          create("div", { className: "meta", text: timeText(item) }),
          create("div", { className: "meta", text: `${item.source}${item.author ? ` · ${item.author}` : ""}` }),
          create("div", { className: stateClass, text: statusText(item) })
        ]);
        const play = create("button", { type: "button", text: "재생", onclick: () => playItem(index), disabled: item.status === "error" ? "" : null });
        list.append(create("li", { className: index === activeIndex ? "active" : "" }, [create("div", { className: "row" }, [main, play])]));
      });
      panel.append(list);
    }

    if (isSoop && items.length) {
      panel.append(create("div", { className: "controls" }, [
        create("button", { type: "button", text: "이전", onclick: () => move(-1), disabled: activeIndex <= 0 ? "" : null }),
        create("button", { type: "button", text: "일시정지", onclick: pauseCurrent }),
        create("button", { type: "button", text: "중지", onclick: stopCurrent }),
        create("button", { type: "button", text: "다음", onclick: () => move(1), disabled: activeIndex >= items.length - 1 ? "" : null })
      ]));
    }

    panel.append(create("footer", { text: note || (isCafe ? "현재 로드된 본문·댓글만 검색합니다." : "광고 종료 후 본편 #video를 제어합니다.") }));
    shadow.append(panel);
  }

  function closestContext(element, scopeElement) {
    if (scopeElement.matches(".CommentItem, .comment_box, li[class*='CommentItem']")) return scopeElement;
    return element.closest(".se-component, .CommentItem, .comment_box, li, p, article") || element.parentElement || scopeElement;
  }

  function authorOf(element) {
    return element.querySelector?.(".comment_nickname, .nickname, [class*='nickname']")?.textContent?.trim() || "";
  }

  function titleOf(element) {
    return element.querySelector?.(".se-oglink-title, [class*='oglink-title']")?.textContent?.trim() || "SOOP 영상";
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
      const range = core.parseRange(context.textContent);
      const invalidRange = !range && core.hasRangeSyntax(context.textContent);
      urls.forEach((parsed) => output.push({
        id: crypto.randomUUID(),
        url: parsed.url,
        videoKey: parsed.videoKey,
        title: titleOf(context),
        start: range?.start ?? parsed.start,
        end: range?.end ?? null,
        source,
        author: source === "본문" ? "" : authorOf(context),
        status: invalidRange ? "error" : range || parsed.start !== null ? "waiting" : "unspecified",
        error: invalidRange ? "시간 형식 또는 시작·종료 순서가 잘못됐습니다." : ""
      }));
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

  async function loadState(show = false) {
    const state = await chrome.storage.local.get(["items", "activeIndex"]);
    items = Array.isArray(state.items) ? state.items : [];
    activeIndex = Number.isInteger(state.activeIndex) ? state.activeIndex : -1;

    if (isSoop) {
      const current = core.parseSoopUrl(location.href);
      let matching = items.findIndex((item) => item.videoKey === current?.videoKey);
      if (matching < 0 && current) {
        matching = items.length;
        items = [...items, {
          id: crypto.randomUUID(), url: current.url, videoKey: current.videoKey, title: document.title || "SOOP 영상",
          start: current.start, end: null, source: "현재 SOOP 페이지", author: "",
          status: current.start === null ? "unspecified" : "waiting", error: ""
        }];
        activeIndex = matching;
        await chrome.storage.local.set({ items, activeIndex });
      } else if (matching >= 0 && (activeIndex < 0 || items[activeIndex]?.videoKey !== current?.videoKey)) {
        activeIndex = matching;
        await chrome.storage.local.set({ activeIndex });
      }
      if (matching >= 0) show = true;
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
    else chrome.runtime.sendMessage({ type: "OPEN_ITEM", index, url: item.url, sameTab: isSoop });
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
    const onTime = () => {
      if (item.end !== null && video.currentTime >= item.end - 0.05) {
        completed = true;
        video.pause();
        saveStatus(index, "completed");
      }
    };
    const onPlaying = () => saveStatus(index, "playing");
    const onWaiting = () => saveStatus(index, "preparing");
    const onPause = () => { if (!completed) saveStatus(index, "paused"); };
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

  function pauseCurrent() {
    currentVideo()?.pause();
  }

  function stopCurrent() {
    playerToken++;
    mediaCleanup();
    const video = currentVideo();
    if (video) video.pause();
    if (activeIndex >= 0) saveStatus(activeIndex, items[activeIndex]?.end === null && items[activeIndex]?.start === null ? "unspecified" : "waiting");
  }

  function move(direction) {
    const index = activeIndex + direction;
    if (index >= 0 && index < items.length) playItem(index);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_PANEL") togglePanel();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !host) return;
    if (changes.items) items = changes.items.newValue || [];
    if (changes.activeIndex) activeIndex = changes.activeIndex.newValue ?? -1;
    render();
  });

  if (isSoop) loadState(false);
})();
