const TOGGLE_FIELDS = [
  ["masterBlockingEnabled", "Master blocking"],
  ["hideHomeFeed", "Hide home recommendations"],
  ["hideSidebarSuggestions", "Hide related sidebar"],
  ["hideEngagementElements", "Hide comments, bell, live chat"],
  ["blurThumbnails", "Blur thumbnails"],
  ["enableIntentionGate", "Enable intention gate"],
  ["disableAutoplay", "Force autoplay off"],
  ["hideEndscreen", "Hide end-screen wall"],
  ["showFloatingTimer", "Show floating on-page timer"],
  ["autoPauseVideoOnTabSwitch", "Auto-pause video on tab switch"],
  ["focusModeWithTimer", "Start blocking with timer"]
];

const ui = {
  toggleList: document.getElementById("toggle-list"),
  intentionInput: document.getElementById("intention-input"),
  saveIntention: document.getElementById("save-intention"),
  timerValue: document.getElementById("timer-value"),
  durationInput: document.getElementById("duration-input"),
  startTimer: document.getElementById("start-timer"),
  stopTimer: document.getElementById("stop-timer"),
  efficiencyValue: document.getElementById("efficiency-value"),
  chart: document.getElementById("chart"),
  statsSummary: document.getElementById("stats-summary")
};

let state = null;
let timerRenderHandle = null;

initialize().catch((error) => {
  console.error("IntentionalTube popup failed", error);
});

async function initialize() {
  await refreshState();
  renderToggles();
  renderFromState();
  wireEvents();

  timerRenderHandle = setInterval(renderTimer, 1000);
}

function wireEvents() {
  ui.saveIntention.addEventListener("click", async () => {
    const intention = ui.intentionInput.value.trim();
    await sendMessage({ type: "setActiveIntention", intention });
    await sendIntentionToActiveYouTubeTab(intention);
    await refreshState();
    renderFromState();
  });

  ui.startTimer.addEventListener("click", async () => {
    const durationMinutes = Number(ui.durationInput.value || 25);
    await sendMessage({ type: "startPomodoro", durationMinutes });
    await refreshState();
    renderFromState();
  });

  ui.stopTimer.addEventListener("click", async () => {
    await sendMessage({ type: "stopPomodoro" });
    await refreshState();
    renderFromState();
  });
}

async function refreshState() {
  const response = await sendMessage({ type: "getDashboardState" });
  state = response;
}

function renderToggles() {
  ui.toggleList.innerHTML = "";

  TOGGLE_FIELDS.forEach(([key, label]) => {
    const row = document.createElement("label");
    row.className = "toggle-item";

    const text = document.createElement("span");
    text.textContent = label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(state.settings[key]);
    input.addEventListener("change", async () => {
      await sendMessage({
        type: "updateSetting",
        key,
        value: input.checked
      });
      await refreshState();
      renderFromState();
    });

    row.append(text, input);
    ui.toggleList.appendChild(row);
  });
}

function renderFromState() {
  if (!state) {
    return;
  }

  ui.intentionInput.value = state.settings.activeIntention || "";
  ui.durationInput.value = String(state.pomodoro.durationMinutes || 25);
  renderTimer();
  renderEfficiency();
}

function renderTimer() {
  if (!state?.pomodoro?.running) {
    ui.timerValue.textContent = `${String(state?.pomodoro?.durationMinutes || 25).padStart(2, "0")}:00`;
    return;
  }

  if (state.pomodoro.paused) {
    const pausedSeconds = Math.max(0, Math.floor((state.pomodoro.remainingMs || 0) / 1000));
    const mm = String(Math.floor(pausedSeconds / 60)).padStart(2, "0");
    const ss = String(pausedSeconds % 60).padStart(2, "0");
    ui.timerValue.textContent = `PAUSED ${mm}:${ss}`;
    return;
  }

  if (!state.pomodoro.endTime) {
    ui.timerValue.textContent = `${String(state?.pomodoro?.durationMinutes || 25).padStart(2, "0")}:00`;
    return;
  }

  const remainingMs = Math.max(0, state.pomodoro.endTime - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  ui.timerValue.textContent = `${mm}:${ss}`;

  if (remainingMs <= 0) {
    refreshState().then(renderFromState);
  }
}

function renderEfficiency() {
  const analytics = state.analytics;
  const percent = Math.round((analytics.weeklyEfficiency || 0) * 100);
  ui.efficiencyValue.textContent = `${percent}%`;

  ui.chart.innerHTML = "";

  analytics.weekRows.forEach((day) => {
    const dayPercent = Math.round((day.efficiency || 0) * 100);
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(8, dayPercent)}%`;

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = day.date.slice(5);

    bar.title = `${day.date}: ${dayPercent}%`;
    bar.appendChild(label);
    ui.chart.appendChild(bar);
  });

  const total = analytics.aggregate.totalSiteMinutes || 0;
  const onTask = analytics.aggregate.onTaskMinutes || 0;
  const offTask = analytics.aggregate.offTaskMinutes || 0;
  const alignment = Math.round((analytics.weeklyAlignment || 0) * 100);

  ui.statsSummary.textContent = `On-task ${onTask}m / Off-task ${offTask}m / Site ${total}m / Alignment ${alignment}%`;
}

async function sendIntentionToActiveYouTubeTab(intention) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.includes("youtube.com")) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "setCurrentIntention",
      intention
    });
  } catch (_error) {
    // Ignore if page has no injected content script yet.
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Request failed"));
        return;
      }

      resolve(response);
    });
  });
}
