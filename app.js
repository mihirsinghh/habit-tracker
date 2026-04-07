const STORAGE_KEY = "habit-tracker-data-v1";
const TILE_DAYS = 42;

const state = loadState();

const elements = {
  habitForm: document.querySelector("#habit-form"),
  habitList: document.querySelector("#habit-list"),
  dashboard: document.querySelector("#dashboard"),
  logForm: document.querySelector("#log-form"),
  logHabit: document.querySelector("#log-habit"),
  logDate: document.querySelector("#log-date"),
  logCount: document.querySelector("#log-count"),
  logSummary: document.querySelector("#log-summary")
};

initialize();

function initialize() {
  elements.logDate.value = formatDateKey(new Date());

  elements.habitForm.addEventListener("submit", handleHabitSubmit);
  elements.logForm.addEventListener("submit", handleLogSubmit);
  elements.logHabit.addEventListener("change", renderLogSummary);
  elements.logDate.addEventListener("change", renderLogSummary);

  render();
}

function loadState() {
  const emptyState = { habits: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.habits)) return emptyState;
    return parsed;
  } catch (error) {
    console.warn("Unable to load habit tracker state.", error);
    return emptyState;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleHabitSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const habit = {
    id: crypto.randomUUID(),
    name: String(formData.get("name")).trim(),
    emoji: String(formData.get("emoji")).trim() || "✨",
    description: String(formData.get("description")).trim(),
    frequency: String(formData.get("frequency")),
    metric: String(formData.get("metric")),
    target: clampNumber(Number(formData.get("target")), 1, 31),
    createdAt: new Date().toISOString(),
    logs: {}
  };

  state.habits.unshift(habit);
  saveState();
  event.currentTarget.reset();
  document.querySelector("#habit-target").value = 1;
  elements.logDate.value = formatDateKey(new Date());
  render();
}

function handleLogSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const habit = findHabit(String(formData.get("habitId")));
  if (!habit) return;

  const date = String(formData.get("date"));
  const count = clampNumber(Number(formData.get("count")), 0, 99);

  if (count === 0) {
    delete habit.logs[date];
  } else {
    habit.logs[date] = count;
  }

  saveState();
  render();
}

function deleteHabit(habitId) {
  const index = state.habits.findIndex((habit) => habit.id === habitId);
  if (index === -1) return;
  state.habits.splice(index, 1);
  saveState();
  render();
}

function render() {
  renderHabitOptions();
  renderHabitList();
  renderDashboard();
  renderLogSummary();
}

function renderHabitOptions() {
  if (state.habits.length === 0) {
    elements.logHabit.innerHTML = '<option value="">No habits yet</option>';
    elements.logHabit.disabled = true;
    elements.logCount.disabled = true;
    return;
  }

  const currentValue = elements.logHabit.value;
  elements.logHabit.disabled = false;
  elements.logCount.disabled = false;
  elements.logHabit.innerHTML = state.habits
    .map(
      (habit) => `
    <option value="${habit.id}" ${habit.id === currentValue ? "selected" : ""}>
      ${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)}
    </option>
  `
    )
    .join("");

  if (!findHabit(elements.logHabit.value)) {
    elements.logHabit.value = state.habits[0].id;
  }
}

function renderHabitList() {
  if (state.habits.length === 0) {
    elements.habitList.innerHTML = `
      <div class="empty-state log-summary">
        Your habits will show up here with streaks, targets, and recent activity.
      </div>
    `;
    return;
  }

  elements.habitList.innerHTML = state.habits
    .map((habit) => {
      const stats = getHabitStats(habit);
      return `
      <article class="habit-card">
        <div class="habit-card-header">
          <div class="habit-badge" aria-hidden="true">${escapeHtml(habit.emoji)}</div>
          <div class="habit-title-group">
            <div class="habit-title">
              <h3>${escapeHtml(habit.name)}</h3>
            </div>
            <div class="metric-row">
              <span class="meta-chip">${formatFrequency(habit)}</span>
              <span class="meta-chip">${stats.totalCompletions} logs saved</span>
            </div>
          </div>
          <div class="habit-card-actions">
            <button class="icon-btn" type="button" data-delete="${habit.id}">Delete</button>
          </div>
        </div>

        <p class="habit-description">${escapeHtml(habit.description || "No description yet.")}</p>

        <div class="habit-footer">
          <strong>${stats.currentStreak}-day streak</strong><br>
          Best streak: ${stats.bestStreak} days. Last completed: ${stats.lastCompletedLabel}.
        </div>
      </article>
    `;
    })
    .join("");

  elements.habitList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHabit(button.dataset.delete));
  });
}

function renderDashboard() {
  if (state.habits.length === 0) {
    elements.dashboard.innerHTML = `
      <div class="empty-state log-summary">
        Add a habit to unlock the streak dashboard and activity tiles.
      </div>
    `;
    return;
  }

  elements.dashboard.innerHTML = state.habits
    .map((habit) => {
      const stats = getHabitStats(habit);
      const tiles = buildTiles(habit);
      return `
      <article class="dashboard-card">
        <div class="dashboard-row">
          <div>
            <h3>${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)}</h3>
            <p class="eyebrow">${formatFrequency(habit)}</p>
          </div>
          <span class="streak-pill">${stats.currentStreak} day streak</span>
        </div>

        <div class="tile-grid">
          ${tiles
            .map(
              (tile) => `
            <div class="tile level-${tile.level}" data-tooltip="${tile.tooltip}" aria-label="${tile.tooltip}"></div>
          `
            )
            .join("")}
        </div>

        <div class="tile-legend">
          <span>Lighter means less progress. Darker means the target was met.</span>
        </div>

        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <span>Current</span>
            <strong>${stats.currentStreak}</strong>
          </div>
          <div class="dashboard-metric">
            <span>Best</span>
            <strong>${stats.bestStreak}</strong>
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderLogSummary() {
  const habit = findHabit(elements.logHabit.value);
  if (!habit) {
    elements.logSummary.textContent = "Add a habit to start logging activity.";
    return;
  }

  const date = elements.logDate.value || formatDateKey(new Date());
  const existingCount = habit.logs[date] || 0;
  elements.logCount.value = existingCount || 1;
  elements.logSummary.innerHTML = `
    <strong>${escapeHtml(habit.name)}</strong><br>
    ${formatDateLong(date)} currently has <strong>${existingCount}</strong> logged.
    Target: ${habit.target} ${readableMetricUnit(habit.metric)}.
    Set count to 0 to clear that day.
  `;
}

function getHabitStats(habit) {
  const dates = Object.keys(habit.logs).sort();
  const today = stripTime(new Date());
  const last42Days = getDateRange(TILE_DAYS);

  let currentStreak = 0;
  let cursor = today;
  while (isDayComplete(habit, formatDateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  let bestStreak = 0;
  let runningStreak = 0;
  last42Days.forEach((date) => {
    if (isDayComplete(habit, date)) {
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  });

  return {
    totalCompletions: dates.length,
    currentStreak,
    bestStreak,
    lastCompletedLabel: dates.length ? formatDateLong(dates[dates.length - 1]) : "Never"
  };
}

function buildTiles(habit) {
  return getDateRange(TILE_DAYS).map((date) => {
    const count = habit.logs[date] || 0;
    const ratio = getCompletionRatio(habit, date);
    const level = ratio === 0 ? 0 : ratio < 0.5 ? 1 : ratio < 1 ? 2 : ratio < 1.5 ? 3 : 4;
    return {
      level,
      tooltip: `${formatDateLong(date)}: ${count} / ${habit.target} ${readableMetricUnit(habit.metric)}`
    };
  });
}

function getCompletionRatio(habit, date) {
  return Math.min((habit.logs[date] || 0) / habit.target, 2);
}

function isDayComplete(habit, date) {
  if (habit.frequency === "weekly") {
    const weekDates = getWeekDates(date);
    const weeklyCount = weekDates.reduce((sum, currentDate) => sum + Math.min(habit.logs[currentDate] || 0, 1), 0);
    return weeklyCount >= habit.target;
  }

  return (habit.logs[date] || 0) >= habit.target;
}

function getWeekDates(dateKey) {
  const anchor = stripTime(new Date(`${dateKey}T00:00:00`));
  const day = anchor.getDay();
  const sunday = addDays(anchor, -day);
  return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(sunday, index)));
}

function getDateRange(totalDays) {
  return Array.from({ length: totalDays }, (_, index) => formatDateKey(addDays(new Date(), -(totalDays - index - 1))));
}

function addDays(date, amount) {
  const copy = stripTime(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatFrequency(habit) {
  const unit = readableMetricUnit(habit.metric);
  if (habit.frequency === "daily") {
    return `${habit.target} ${unit} daily`;
  }
  if (habit.frequency === "weekly") {
    return `${habit.target} days each week`;
  }
  return `${habit.target} ${unit} custom`;
}

function readableMetricUnit(metric) {
  if (metric === "days-per-week") return "days";
  if (metric === "times-per-week") return "times";
  return "times";
}

function findHabit(habitId) {
  return state.habits.find((habit) => habit.id === habitId);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
