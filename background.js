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

const MINUTE_ALARM = "intentionaltube-minute-tick";
const POMODORO_FINISH_ALARM = "intentionaltube-pomodoro-finish";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await chrome.alarms.create(MINUTE_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await chrome.alarms.create(MINUTE_ALARM, { periodInMinutes: 1 });
  await evaluatePomodoroAutoPause();
});

chrome.tabs.onActivated.addListener(async () => {
  await evaluatePomodoroAutoPause();
});

chrome.tabs.onUpdated.addListener(async () => {
  await evaluatePomodoroAutoPause();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await pausePomodoro("window-not-focused");
    return;
  }
  await evaluatePomodoroAutoPause();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MINUTE_ALARM) {
    await sampleActiveTabAnalytics();
    return;
  }

  if (alarm.name === POMODORO_FINISH_ALARM) {
    const pomodoro = await getPomodoro();
    if (!pomodoro.running) {
      return;
    }

    await setPomodoro({
      ...pomodoro,
      running: false,
      startedAt: null,
      endTime: null,
      completedSessions: (pomodoro.completedSessions || 0) + 1
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || "Unknown error" });
    });

  return true;
});

async function handleRuntimeMessage(message) {
  switch (message?.type) {
    case "getDashboardState":
      return getDashboardState();
    case "updateSetting":
      await updateSetting(message.key, message.value);
      return getDashboardState();
    case "startPomodoro":
      await startPomodoro(message.durationMinutes);
      return getDashboardState();
    case "stopPomodoro":
      await stopPomodoro();
      return getDashboardState();
    case "recordIntentionPrompt":
      await incrementDailyMetric("intentionPrompts", 1);
      return {};
    case "recordIntentionUnlock":
      await incrementDailyMetric("intentionCompleted", 1);
      await updateSetting("activeIntention", message.intention || "");
      return {};
    case "setActiveIntention":
      await updateSetting("activeIntention", message.intention || "");
      return getDashboardState();
    default:
      return {};
  }
}

async function ensureDefaults() {
  const current = await chrome.storage.local.get(["settings", "pomodoro", "analytics"]);

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(current.settings || {})
  };

  const pomodoro = {
    ...DEFAULT_POMODORO,
    ...(current.pomodoro || {})
  };

  const analytics = current.analytics || { days: {} };

  await chrome.storage.local.set({ settings, pomodoro, analytics });
}

async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

async function updateSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await chrome.storage.local.set({ settings });
}

async function getPomodoro() {
  const data = await chrome.storage.local.get("pomodoro");
  return { ...DEFAULT_POMODORO, ...(data.pomodoro || {}) };
}

async function setPomodoro(nextPomodoro) {
  await chrome.storage.local.set({ pomodoro: nextPomodoro });
}

async function startPomodoro(durationMinutes) {
  const minutes = Number.isFinite(durationMinutes)
    ? Math.max(1, Math.min(180, Math.floor(durationMinutes)))
    : 25;
  const now = Date.now();
  const remainingMs = minutes * 60 * 1000;
  const endTime = now + remainingMs;
  const activeTab = await getActiveTab();

  await setPomodoro({
    running: true,
    paused: false,
    durationMinutes: minutes,
    startedAt: now,
    endTime,
    remainingMs,
    pausedAt: null,
    targetTabId: activeTab?.id || null,
    completedSessions: (await getPomodoro()).completedSessions || 0
  });

  const settings = await getSettings();
  if (settings.focusModeWithTimer && !settings.masterBlockingEnabled) {
    settings.masterBlockingEnabled = true;
    await chrome.storage.local.set({ settings });
  }

  await chrome.alarms.create(POMODORO_FINISH_ALARM, { when: endTime });
  await evaluatePomodoroAutoPause();
}

async function stopPomodoro() {
  const pomodoro = await getPomodoro();
  await setPomodoro({
    ...pomodoro,
    running: false,
    paused: false,
    startedAt: null,
    endTime: null,
    remainingMs: null,
    pausedAt: null,
    targetTabId: null
  });
  await chrome.alarms.clear(POMODORO_FINISH_ALARM);
}

async function getDashboardState() {
  await ensureDefaults();
  const settings = await getSettings();
  const pomodoro = await getPomodoro();
  const analytics = await getAnalytics();
  return { settings, pomodoro, analytics };
}

async function sampleActiveTabAnalytics() {
  await evaluatePomodoroAutoPause();

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id || !activeTab.url || !activeTab.url.includes("youtube.com")) {
    return;
  }

  await incrementDailyMetric("totalSiteMinutes", 1);

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: "getEngagementState" });
    if (response?.onTask) {
      await incrementDailyMetric("onTaskMinutes", 1);
    } else {
      await incrementDailyMetric("offTaskMinutes", 1);
    }
  } catch (_error) {
    await incrementDailyMetric("offTaskMinutes", 1);
  }
}

async function evaluatePomodoroAutoPause() {
  const pomodoro = await getPomodoro();
  if (!pomodoro.running) {
    return;
  }

  const activeTab = await getActiveTab();
  const shouldBeActive = shouldPomodoroBeActiveOnTab(pomodoro, activeTab);

  if (!shouldBeActive && !pomodoro.paused) {
    await pausePomodoro("inactive-tab");
    return;
  }

  if (shouldBeActive && pomodoro.paused) {
    await resumePomodoro();
  }
}

function shouldPomodoroBeActiveOnTab(pomodoro, activeTab) {
  if (!activeTab?.id) {
    return false;
  }

  if (pomodoro.targetTabId != null) {
    return activeTab.id === pomodoro.targetTabId;
  }

  return isYouTubeUrl(activeTab.url);
}

async function pausePomodoro(_reason) {
  const pomodoro = await getPomodoro();
  if (!pomodoro.running || pomodoro.paused || !pomodoro.endTime) {
    return;
  }

  const remainingMs = Math.max(0, pomodoro.endTime - Date.now());
  await setPomodoro({
    ...pomodoro,
    paused: true,
    endTime: null,
    pausedAt: Date.now(),
    remainingMs
  });
  await chrome.alarms.clear(POMODORO_FINISH_ALARM);
}

async function resumePomodoro() {
  const pomodoro = await getPomodoro();
  if (!pomodoro.running || !pomodoro.paused) {
    return;
  }

  const remainingMs = Math.max(0, pomodoro.remainingMs || 0);
  if (remainingMs === 0) {
    await stopPomodoro();
    return;
  }

  const endTime = Date.now() + remainingMs;
  await setPomodoro({
    ...pomodoro,
    paused: false,
    pausedAt: null,
    endTime,
    remainingMs
  });

  await chrome.alarms.create(POMODORO_FINISH_ALARM, { when: endTime });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

function isYouTubeUrl(url) {
  return Boolean(url && url.includes("youtube.com"));
}

async function getAnalytics() {
  const data = await chrome.storage.local.get("analytics");
  const analytics = data.analytics || { days: {} };
  const week = getLastNDates(7);

  const weekRows = week.map((date) => {
    const day = analytics.days[date] || emptyDay();
    const total = day.totalSiteMinutes || 0;
    const onTask = day.onTaskMinutes || 0;
    const intentionPrompts = day.intentionPrompts || 0;
    const intentionCompleted = day.intentionCompleted || 0;
    const alignment = intentionPrompts === 0
      ? 1
      : Math.min(1, intentionCompleted / intentionPrompts);
    const efficiency = total === 0
      ? 0
      : (onTask / total) * alignment;

    return {
      date,
      ...day,
      alignment,
      efficiency
    };
  });

  const aggregate = weekRows.reduce((acc, day) => {
    acc.totalSiteMinutes += day.totalSiteMinutes || 0;
    acc.onTaskMinutes += day.onTaskMinutes || 0;
    acc.offTaskMinutes += day.offTaskMinutes || 0;
    acc.intentionPrompts += day.intentionPrompts || 0;
    acc.intentionCompleted += day.intentionCompleted || 0;
    return acc;
  }, emptyDay());

  const weeklyAlignment = aggregate.intentionPrompts === 0
    ? 1
    : Math.min(1, aggregate.intentionCompleted / aggregate.intentionPrompts);

  const weeklyEfficiency = aggregate.totalSiteMinutes === 0
    ? 0
    : (aggregate.onTaskMinutes / aggregate.totalSiteMinutes) * weeklyAlignment;

  return {
    weekRows,
    aggregate,
    weeklyAlignment,
    weeklyEfficiency
  };
}

async function incrementDailyMetric(metric, incrementBy) {
  const storage = await chrome.storage.local.get("analytics");
  const analytics = storage.analytics || { days: {} };
  const dateKey = getDateKey();
  const day = {
    ...emptyDay(),
    ...(analytics.days[dateKey] || {})
  };

  day[metric] = (day[metric] || 0) + incrementBy;
  analytics.days[dateKey] = day;

  await chrome.storage.local.set({ analytics });
}

function emptyDay() {
  return {
    totalSiteMinutes: 0,
    onTaskMinutes: 0,
    offTaskMinutes: 0,
    intentionPrompts: 0,
    intentionCompleted: 0
  };
}

function getDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLastNDates(n) {
  const dates = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}
