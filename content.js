const DEFAULT_SETTINGS = {
  masterBlockingEnabled: true,
  hideHomeFeed: true,
  hideSidebarSuggestions: true,
  hideEngagementElements: true,
  blurThumbnails: true,
  enableIntentionGate: true,
  disableAutoplay: true,
  hideEndscreen: true,
  showFloatingTimer: true,
  autoPauseVideoOnTabSwitch: true,
  floatingTimerPosition: null,
  focusModeWithTimer: true,
  activeIntention: ""
};

const DEFAULT_POMODORO = {
  running: false,
  paused: false,
  durationMinutes: 25,
  startedAt: null,
  endTime: null,
  remainingMs: null,
  pausedAt: null,
  targetTabId: null,
  completedSessions: 0
};

let settings = { ...DEFAULT_SETTINGS };
let styleElement = null;
let homeMessageElement = null;
let intentionGateElement = null;
let ambientBannerElement = null;
let currentIntention = "";
let lastUnlockedVideoId = null;
let observer = null;
let updateQueued = false;
let cachedCss = "";
let lastRouteKey = "";
let floatingTimerElement = null;
let pomodoroState = { ...DEFAULT_POMODORO };
let floatingTimerIntervalId = null;
let floatingTimerDragState = null;
let lastAutoPauseAt = 0;

(async function initialize() {
  await loadSettings();
  await loadPomodoro();
  runDomUpdate();
  setupListeners();
  setupObserver();
})();

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  currentIntention = settings.activeIntention || "";
}

async function loadPomodoro() {
  const stored = await chrome.storage.local.get("pomodoro");
  pomodoroState = { ...DEFAULT_POMODORO, ...(stored.pomodoro || {}) };
}

function setupListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.settings?.newValue) {
      settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      currentIntention = settings.activeIntention || currentIntention;
      scheduleDomUpdate();
    }

    if (changes.pomodoro?.newValue) {
      pomodoroState = { ...DEFAULT_POMODORO, ...changes.pomodoro.newValue };
      renderFloatingTimer();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "getEngagementState") {
      sendResponse(getEngagementState());
      return;
    }

    if (message?.type === "setCurrentIntention") {
      currentIntention = (message.intention || "").trim();
      chrome.runtime.sendMessage({
        type: "setActiveIntention",
        intention: currentIntention
      });
      if (currentIntention && isWatchPage()) {
        renderAmbientBanner();
      }
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: true });
  });

  window.addEventListener("yt-navigate-finish", () => {
    scheduleDomUpdate();
  });

  window.addEventListener("popstate", () => {
    scheduleDomUpdate();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseVideoForTabSwitch();
    }
  });

  window.addEventListener("blur", () => {
    if (document.hidden) {
      pauseVideoForTabSwitch();
    }
  });
}

function setupObserver() {
  observer = new MutationObserver((mutations) => {
    const hasExternalMutations = mutations.some((mutation) => {
      if (mutation.target === styleElement) {
        return false;
      }

      if (mutation.target === homeMessageElement || mutation.target === intentionGateElement || mutation.target === ambientBannerElement) {
        return false;
      }

      const touchedNode = mutation.target?.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation.target?.parentElement;

      if (!touchedNode) {
        return true;
      }

      if (touchedNode.closest && touchedNode.closest("#intentionaltube-home-message, #intentionaltube-intention-gate, #intentionaltube-ambient-banner, #intentionaltube-style, #intentionaltube-floating-timer")) {
        return false;
      }

      return true;
    });

    if (hasExternalMutations) {
      scheduleDomUpdate();
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scheduleDomUpdate() {
  if (updateQueued) {
    return;
  }

  updateQueued = true;
  window.requestAnimationFrame(() => {
    updateQueued = false;
    runDomUpdate();
  });
}

function runDomUpdate() {
  lastRouteKey = `${window.location.pathname}${window.location.search}`;

  applyAllRules();
  handleVideoGate();
  if (isWatchPage() && !intentionGateElement) {
    renderAmbientBanner();
  }
  enforceAutoplayOff();
  renderFloatingTimer();
}

function applyAllRules() {
  ensureStyles();
  renderHomeMessage();
  if (!isWatchPage()) {
    removeIntentionGate();
    removeAmbientBanner();
    removeFloatingTimer();
  }
}

function renderFloatingTimer() {
  if (!settings.masterBlockingEnabled || !settings.showFloatingTimer || !isWatchPage()) {
    removeFloatingTimer();
    return;
  }

  if (!floatingTimerElement) {
    floatingTimerElement = document.createElement("div");
    floatingTimerElement.id = "intentionaltube-floating-timer";
    floatingTimerElement.style.cssText = [
      "position: fixed",
      "z-index: 2147483645",
      "padding: 8px 12px",
      "border-radius: 999px",
      "background: rgba(10, 30, 42, 0.92)",
      "color: #f1fff8",
      "font: 700 13px/1.2 'Segoe UI', Tahoma, sans-serif",
      "box-shadow: 0 8px 18px rgba(0,0,0,.32)",
      "pointer-events: auto",
      "cursor: grab",
      "user-select: none",
      "letter-spacing: 0.3px",
      "max-width: 220px",
      "white-space: nowrap",
      "overflow: hidden",
      "text-overflow: ellipsis"
    ].join(";");

    document.body.appendChild(floatingTimerElement);
    attachFloatingTimerDragHandlers();
  }

  positionFloatingTimer();
  updateFloatingTimerText();
  syncFloatingTimerInterval();
}

function positionFloatingTimer() {
  if (!floatingTimerElement) {
    return;
  }

  const customPosition = settings.floatingTimerPosition;
  if (customPosition && Number.isFinite(customPosition.xPercent) && Number.isFinite(customPosition.yPercent)) {
    const x = Math.round(clamp(customPosition.xPercent, 0, 1) * window.innerWidth);
    const y = Math.round(clamp(customPosition.yPercent, 0, 1) * window.innerHeight);
    const bounded = getBoundedPosition(x, y);
    floatingTimerElement.style.left = `${bounded.x}px`;
    floatingTimerElement.style.top = `${bounded.y}px`;
    return;
  }

  const player = document.querySelector("#player") || document.querySelector("ytd-player");
  if (!player) {
    const bounded = getBoundedPosition(16, 86);
    floatingTimerElement.style.left = `${bounded.x}px`;
    floatingTimerElement.style.top = `${bounded.y}px`;
    return;
  }

  const rect = player.getBoundingClientRect();
  const bounded = getBoundedPosition(rect.left + 12, rect.top + 12);

  floatingTimerElement.style.left = `${bounded.x}px`;
  floatingTimerElement.style.top = `${bounded.y}px`;
}

function updateFloatingTimerText() {
  if (!floatingTimerElement) {
    return;
  }

  if (!pomodoroState.running || !pomodoroState.endTime) {
    if (pomodoroState.running && pomodoroState.paused) {
      const pausedSeconds = Math.max(0, Math.floor((pomodoroState.remainingMs || 0) / 1000));
      const pausedMinutes = String(Math.floor(pausedSeconds / 60)).padStart(2, "0");
      const pausedRemainderSeconds = String(pausedSeconds % 60).padStart(2, "0");
      floatingTimerElement.textContent = `Paused ${pausedMinutes}:${pausedRemainderSeconds}`;
      return;
    }

    const idleMinutes = String(pomodoroState.durationMinutes || 25).padStart(2, "0");
    floatingTimerElement.textContent = `Focus ${idleMinutes}:00`;
    return;
  }

  const remainingMs = Math.max(0, pomodoroState.endTime - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  floatingTimerElement.textContent = `Focus ${minutes}:${seconds}`;
}

function attachFloatingTimerDragHandlers() {
  if (!floatingTimerElement) {
    return;
  }

  floatingTimerElement.addEventListener("pointerdown", (event) => {
    if (!floatingTimerElement) {
      return;
    }

    const rect = floatingTimerElement.getBoundingClientRect();
    floatingTimerDragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };

    floatingTimerElement.style.cursor = "grabbing";
    floatingTimerElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  floatingTimerElement.addEventListener("pointermove", (event) => {
    if (!floatingTimerDragState || floatingTimerDragState.pointerId !== event.pointerId) {
      return;
    }

    const nextX = event.clientX - floatingTimerDragState.offsetX;
    const nextY = event.clientY - floatingTimerDragState.offsetY;
    const bounded = getBoundedPosition(nextX, nextY);
    floatingTimerElement.style.left = `${bounded.x}px`;
    floatingTimerElement.style.top = `${bounded.y}px`;
  });

  floatingTimerElement.addEventListener("pointerup", async (event) => {
    if (!floatingTimerDragState || floatingTimerDragState.pointerId !== event.pointerId) {
      return;
    }

    floatingTimerElement.style.cursor = "grab";
    floatingTimerElement.releasePointerCapture(event.pointerId);
    floatingTimerDragState = null;
    await persistFloatingTimerPosition();
  });

  floatingTimerElement.addEventListener("pointercancel", (event) => {
    if (!floatingTimerDragState || floatingTimerDragState.pointerId !== event.pointerId) {
      return;
    }

    floatingTimerElement.style.cursor = "grab";
    floatingTimerDragState = null;
  });
}

function getBoundedPosition(x, y) {
  const timerWidth = floatingTimerElement ? floatingTimerElement.offsetWidth : 180;
  const timerHeight = floatingTimerElement ? floatingTimerElement.offsetHeight : 40;
  const clampedX = clamp(Math.round(x), 8, Math.max(8, window.innerWidth - timerWidth - 8));
  const clampedY = clamp(Math.round(y), 8, Math.max(8, window.innerHeight - timerHeight - 8));

  return { x: clampedX, y: clampedY };
}

async function persistFloatingTimerPosition() {
  if (!floatingTimerElement) {
    return;
  }

  const rect = floatingTimerElement.getBoundingClientRect();
  const xPercent = window.innerWidth > 0 ? rect.left / window.innerWidth : 0;
  const yPercent = window.innerHeight > 0 ? rect.top / window.innerHeight : 0;
  const position = {
    xPercent: clamp(xPercent, 0, 1),
    yPercent: clamp(yPercent, 0, 1)
  };

  settings.floatingTimerPosition = position;

  try {
    await chrome.runtime.sendMessage({
      type: "updateSetting",
      key: "floatingTimerPosition",
      value: position
    });
  } catch (_error) {
    // Ignore storage write errors for drag persistence.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncFloatingTimerInterval() {
  const shouldRun = Boolean(
    floatingTimerElement &&
    settings.masterBlockingEnabled &&
    settings.showFloatingTimer &&
    isWatchPage() &&
    pomodoroState.running &&
    pomodoroState.endTime
  );

  if (shouldRun && !floatingTimerIntervalId) {
    floatingTimerIntervalId = window.setInterval(() => {
      updateFloatingTimerText();
      positionFloatingTimer();
    }, 1000);
    return;
  }

  if (!shouldRun && floatingTimerIntervalId) {
    window.clearInterval(floatingTimerIntervalId);
    floatingTimerIntervalId = null;
  }
}

function removeFloatingTimer() {
  if (floatingTimerIntervalId) {
    window.clearInterval(floatingTimerIntervalId);
    floatingTimerIntervalId = null;
  }

  if (floatingTimerElement?.parentElement) {
    floatingTimerElement.parentElement.removeChild(floatingTimerElement);
  }
  floatingTimerElement = null;
}

function ensureStyles() {
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "intentionaltube-style";
    document.head.appendChild(styleElement);
  }

  if (!settings.masterBlockingEnabled) {
    if (cachedCss) {
      cachedCss = "";
      styleElement.textContent = "";
    }
    removeHomeMessage();
    return;
  }

  const cssRules = [];

  if (settings.blurThumbnails) {
    cssRules.push(`
      img.yt-img-shadow {
        filter: blur(20px) !important;
      }
    `);
  }

  if (settings.hideSidebarSuggestions) {
    cssRules.push(`
      #secondary,
      ytd-watch-next-secondary-results-renderer,
      ytd-compact-video-renderer {
        display: none !important;
      }
    `);
  }

  if (settings.hideEngagementElements) {
    cssRules.push(`
      #comments,
      ytd-comments,
      ytd-live-chat-frame,
      #chat,
      ytd-notification-topbar-button-renderer,
      button[aria-label*="Notifications"] {
        display: none !important;
      }
    `);
  }

  if (settings.hideEndscreen) {
    cssRules.push(`
      .ytp-endscreen-content,
      .ytp-ce-element,
      .ytp-ce-covering-overlay {
        display: none !important;
      }
    `);
  }

  if (settings.disableAutoplay) {
    cssRules.push(`
      .ytp-autonav-toggle-button {
        pointer-events: none !important;
        opacity: 0.4 !important;
      }
    `);
  }

  if (settings.hideHomeFeed && isHomePage()) {
    cssRules.push(`
      #contents.ytd-rich-grid-renderer,
      ytd-rich-grid-renderer {
        display: none !important;
      }
    `);
  }

  const nextCss = cssRules.join("\n");
  if (nextCss !== cachedCss) {
    cachedCss = nextCss;
    styleElement.textContent = nextCss;
  }
}

function renderHomeMessage() {
  if (!settings.masterBlockingEnabled || !settings.hideHomeFeed || !isHomePage()) {
    removeHomeMessage();
    return;
  }

  if (!homeMessageElement) {
    homeMessageElement = document.createElement("div");
    homeMessageElement.id = "intentionaltube-home-message";
    homeMessageElement.style.cssText = [
      "position: fixed",
      "top: 50%",
      "left: 50%",
      "transform: translate(-50%, -50%)",
      "z-index: 2147483644",
      "width: min(620px, 88vw)",
      "padding: 20px",
      "border-radius: 16px",
      "background: linear-gradient(120deg, #0b1f2a 0%, #1f3c2e 100%)",
      "color: #f4f9f7",
      "font-family: 'Segoe UI', Tahoma, sans-serif",
      "box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35)",
      "text-align: center"
    ].join(";");

    homeMessageElement.innerHTML = `
      <h2 style="margin: 0 0 10px; font-size: 24px;">Ready to Study?</h2>
      <p style="margin: 0 0 16px; opacity: 0.9;">Search for exactly what you need and stay intentional.</p>
      <form id="intentionaltube-search-form" action="/results" method="get" style="display:flex; gap:8px; justify-content:center;">
        <input
          name="search_query"
          placeholder="Search your lecture, topic, or concept"
          style="flex:1; min-width: 220px; max-width:420px; padding:10px 12px; border:none; border-radius:10px;"
        />
        <button type="submit" style="padding:10px 14px; border:none; border-radius:10px; background:#f6b93b; color:#2b2b2b; font-weight:700; cursor:pointer;">
          Search
        </button>
      </form>
    `;

    document.body.appendChild(homeMessageElement);
  }
}

function removeHomeMessage() {
  if (homeMessageElement?.parentElement) {
    homeMessageElement.parentElement.removeChild(homeMessageElement);
  }
  homeMessageElement = null;
}

function handleVideoGate() {
  if (!settings.masterBlockingEnabled || !settings.enableIntentionGate || !isWatchPage()) {
    removeIntentionGate();
    return;
  }

  const videoId = getCurrentVideoId();
  if (!videoId) {
    return;
  }

  if (videoId === lastUnlockedVideoId) {
    renderAmbientBanner();
    return;
  }

  showIntentionGate(videoId);
}

function showIntentionGate(videoId) {
  if (intentionGateElement) {
    return;
  }

  chrome.runtime.sendMessage({ type: "recordIntentionPrompt" });

  intentionGateElement = document.createElement("div");
  intentionGateElement.id = "intentionaltube-intention-gate";
  intentionGateElement.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 2147483646",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "background: rgba(8, 12, 19, 0.92)",
    "backdrop-filter: blur(4px)",
    "font-family: 'Segoe UI', Tahoma, sans-serif"
  ].join(";");

  intentionGateElement.innerHTML = `
    <div style="width:min(560px, 92vw); border-radius:18px; padding:24px; background:linear-gradient(145deg,#123047 0%,#2f4f39 100%); color:#eef6f2; box-shadow:0 22px 50px rgba(0,0,0,.4)">
      <h2 style="margin:0 0 10px; font-size:26px;">Set your intention</h2>
      <p style="margin:0 0 14px; opacity:.92;">Type a concrete goal before you unlock this video.</p>
      <input id="intentionaltube-intention-input" placeholder="Example: Review 20 mins of Linear Algebra" style="width:100%; box-sizing:border-box; padding:12px; border-radius:10px; border:none; margin-bottom:12px;" />
      <button id="intentionaltube-unlock-btn" style="width:100%; padding:12px; border-radius:10px; border:none; font-weight:700; background:#f7cd68; color:#203024; cursor:pointer;">Unlock Video</button>
      <p id="intentionaltube-gate-error" style="margin:10px 0 0; color:#ffdede; min-height:20px;"></p>
    </div>
  `;

  document.body.appendChild(intentionGateElement);

  const input = intentionGateElement.querySelector("#intentionaltube-intention-input");
  const button = intentionGateElement.querySelector("#intentionaltube-unlock-btn");
  const error = intentionGateElement.querySelector("#intentionaltube-gate-error");

  if (currentIntention) {
    input.value = currentIntention;
  }

  const unlock = () => {
    const value = input.value.trim();
    if (!value) {
      error.textContent = "Please enter a specific intention to continue.";
      return;
    }

    currentIntention = value;
    lastUnlockedVideoId = videoId;

    chrome.runtime.sendMessage({
      type: "recordIntentionUnlock",
      intention: value
    });

    removeIntentionGate();
    renderAmbientBanner();
  };

  button.addEventListener("click", unlock);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      unlock();
    }
  });

  setTimeout(() => input.focus(), 0);
}

function removeIntentionGate() {
  if (intentionGateElement?.parentElement) {
    intentionGateElement.parentElement.removeChild(intentionGateElement);
  }
  intentionGateElement = null;
}

function renderAmbientBanner() {
  if (!settings.masterBlockingEnabled || !settings.enableIntentionGate || !isWatchPage() || !currentIntention) {
    removeAmbientBanner();
    return;
  }

  if (!ambientBannerElement) {
    ambientBannerElement = document.createElement("div");
    ambientBannerElement.id = "intentionaltube-ambient-banner";
    ambientBannerElement.style.cssText = [
      "position: fixed",
      "top: 72px",
      "left: 50%",
      "transform: translateX(-50%)",
      "z-index: 2147483645",
      "background: rgba(4, 36, 36, 0.85)",
      "color: #e9fff4",
      "padding: 8px 14px",
      "border-radius: 999px",
      "font: 600 13px/1.2 'Segoe UI', Tahoma, sans-serif",
      "box-shadow: 0 8px 18px rgba(0,0,0,.3)",
      "max-width: 78vw",
      "white-space: nowrap",
      "overflow: hidden",
      "text-overflow: ellipsis"
    ].join(";");

    document.body.appendChild(ambientBannerElement);
  }

  ambientBannerElement.textContent = `Intention: ${currentIntention}`;
}

function removeAmbientBanner() {
  if (ambientBannerElement?.parentElement) {
    ambientBannerElement.parentElement.removeChild(ambientBannerElement);
  }
  ambientBannerElement = null;
}

function enforceAutoplayOff() {
  if (!settings.masterBlockingEnabled || !settings.disableAutoplay || !isWatchPage()) {
    return;
  }

  const toggle = document.querySelector(".ytp-autonav-toggle-button[aria-checked='true']");
  if (toggle) {
    toggle.click();
  }
}

function getEngagementState() {
  if (!settings.masterBlockingEnabled) {
    return { onTask: false };
  }

  if (!window.location.href.includes("youtube.com")) {
    return { onTask: false };
  }

  if (isWatchPage() && !intentionGateElement && Boolean(currentIntention)) {
    return { onTask: true, hasIntention: true };
  }

  return { onTask: false, hasIntention: Boolean(currentIntention) };
}

function isHomePage() {
  return window.location.pathname === "/";
}

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function getCurrentVideoId() {
  const url = new URL(window.location.href);
  return url.searchParams.get("v");
}

function pauseVideoForTabSwitch() {
  if (!settings.masterBlockingEnabled || !settings.autoPauseVideoOnTabSwitch || !isWatchPage()) {
    return;
  }

  const now = Date.now();
  if (now - lastAutoPauseAt < 500) {
    return;
  }
  lastAutoPauseAt = now;

  const player = findYouTubeVideoElement();
  if (!player) {
    return;
  }

  if (!player.paused && !player.ended) {
    try {
      player.pause();
    } catch (_error) {
      // Ignore player pause errors.
    }
  }
}

function findYouTubeVideoElement() {
  const direct = document.querySelector("video.html5-main-video");
  if (direct) {
    return direct;
  }

  const container = document.querySelector("#movie_player");
  if (!container) {
    return null;
  }

  return container.querySelector("video") || null;
}
