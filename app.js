const STORAGE_KEY = "habit-tracker-data-v1";
const TILE_DAYS = 42;
const HISTORY_DAY_LABELS = [
  { label: "Mon", row: 1 },
  { label: "Wed", row: 3 },
  { label: "Fri", row: 5 }
];

const state = loadState();
const uiState = {
  editingHabitId: null,
  selectedHabitId: null,
  selectedYear: null
};

const elements = {
  habitForm: document.querySelector("#habit-form"),
  habitFormTitle: document.querySelector("#habit-form-title"),
  habitSubmitBtn: document.querySelector("#habit-submit-btn"),
  habitCancelBtn: document.querySelector("#habit-cancel-btn"),
  dashboard: document.querySelector("#dashboard"),
  historyPanel: document.querySelector("#history-panel"),
  habitHistory: document.querySelector("#habit-history"),
  logForm: document.querySelector("#log-form"),
  logHabit: document.querySelector("#log-habit"),
  logDate: document.querySelector("#log-date"),
  logCount: document.querySelector("#log-count"),
  logSummary: document.querySelector("#log-summary")
};

initialize();

function initialize() {
  elements.logDate.value = formatDateKey(new Date());

  registerServiceWorker();
  elements.habitForm.addEventListener("submit", handleHabitSubmit);
  elements.habitCancelBtn.addEventListener("click", resetHabitForm);
  elements.logForm.addEventListener("submit", handleLogSubmit);
  elements.logHabit.addEventListener("change", renderLogSummary);
  elements.logDate.addEventListener("change", renderLogSummary);

  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Unable to register service worker.", error);
    });
  });
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
  const habitData = {
    name: String(formData.get("name")).trim(),
    emoji: String(formData.get("emoji")).trim() || "\u2728",
    description: String(formData.get("description")).trim(),
    frequency: String(formData.get("frequency")),
    metric: sanitizeMetric(formData.get("metric")),
    target: clampNumber(Number(formData.get("target")), 1, 31)
  };

  if (uiState.editingHabitId) {
    const habit = findHabit(uiState.editingHabitId);
    if (!habit) {
      resetHabitForm();
      render();
      return;
    }

    const shouldContinue = window.confirm(
      "Editing this habit will permanently delete all of its historical data. Do you want to continue?"
    );
    if (!shouldContinue) return;

    Object.assign(habit, habitData, { logs: {} });
    uiState.selectedHabitId = habit.id;
    uiState.selectedYear = getDefaultHistoryYear(habit);
    saveState();
    resetHabitForm();
    render();
    return;
  }

  const habit = {
    id: crypto.randomUUID(),
    ...habitData,
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
  syncSelection();
  render();
}

function deleteHabit(habitId) {
  const index = state.habits.findIndex((habit) => habit.id === habitId);
  if (index === -1) return;

  state.habits.splice(index, 1);
  if (uiState.editingHabitId === habitId) {
    resetHabitForm();
  }
  if (uiState.selectedHabitId === habitId) {
    uiState.selectedHabitId = null;
    uiState.selectedYear = null;
  }

  saveState();
  syncSelection();
  render();
}

function startEditingHabit(habitId) {
  const habit = findHabit(habitId);
  if (!habit) return;

  uiState.editingHabitId = habit.id;
  document.querySelector("#habit-name").value = habit.name;
  document.querySelector("#habit-emoji").value = habit.emoji;
  document.querySelector("#habit-description").value = habit.description;
  document.querySelector("#habit-frequency").value = habit.frequency;
  document.querySelector("#habit-target").value = habit.target;
  document.querySelector("#habit-metric").value = readableMetricUnit(habit.metric);
  renderHabitFormState();
  elements.habitForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetHabitForm() {
  uiState.editingHabitId = null;
  elements.habitForm.reset();
  document.querySelector("#habit-target").value = 1;
  document.querySelector("#habit-metric").value = "times";
  renderHabitFormState();
}

function toggleHistoryForHabit(habitId) {
  if (uiState.selectedHabitId === habitId) {
    uiState.selectedHabitId = null;
    uiState.selectedYear = null;
  } else {
    uiState.selectedHabitId = habitId;
    const habit = findHabit(habitId);
    uiState.selectedYear = habit ? getDefaultHistoryYear(habit) : null;
  }

  renderDashboard();
  renderHabitHistory();
}

function selectHistoryYear(year) {
  uiState.selectedYear = year;
  renderHabitHistory();
}

function syncSelection() {
  if (!uiState.selectedHabitId) return;

  const selectedHabit = findHabit(uiState.selectedHabitId);
  if (!selectedHabit) {
    uiState.selectedHabitId = null;
    uiState.selectedYear = null;
    return;
  }

  const availableYears = getAvailableYears(selectedHabit);
  if (!availableYears.includes(uiState.selectedYear)) {
    uiState.selectedYear = getDefaultHistoryYear(selectedHabit);
  }
}

function render() {
  syncSelection();
  renderHabitFormState();
  renderHabitOptions();
  renderDashboard();
  renderHabitHistory();
  renderLogSummary();
}

function renderHabitFormState() {
  const isEditing = Boolean(uiState.editingHabitId);
  elements.habitFormTitle.textContent = isEditing ? "Edit a habit" : "Create a habit";
  elements.habitSubmitBtn.textContent = isEditing ? "Save changes" : "Add habit";
  elements.habitCancelBtn.classList.toggle("hidden", !isEditing);
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
      const tiles = buildRecentTiles(habit);
      const isSelected = habit.id === uiState.selectedHabitId;
      return `
      <article class="dashboard-card ${isSelected ? "dashboard-card-selected" : ""}" data-dashboard-habit="${habit.id}" tabindex="0" role="button" aria-pressed="${isSelected}">
        <div class="dashboard-row">
          <div>
            <h3>${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)}</h3>
            <p class="eyebrow">${formatFrequency(habit)}</p>
          </div>
          <div class="dashboard-card-actions">
            <button class="icon-btn" type="button" data-edit-habit="${habit.id}">Edit</button>
            <button class="icon-btn" type="button" data-delete-habit="${habit.id}">Delete</button>
          </div>
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
          <span>${isSelected ? "Click again to close the yearly view." : "Click this card to open the yearly view."}</span>
          <span class="streak-pill">${stats.currentStreak} day streak</span>
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

  elements.dashboard.querySelectorAll("[data-edit-habit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      startEditingHabit(button.dataset.editHabit);
    });
  });

  elements.dashboard.querySelectorAll("[data-delete-habit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteHabit(button.dataset.deleteHabit);
    });
  });

  elements.dashboard.querySelectorAll("[data-dashboard-habit]").forEach((card) => {
    card.addEventListener("click", () => toggleHistoryForHabit(card.dataset.dashboardHabit));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleHistoryForHabit(card.dataset.dashboardHabit);
      }
    });
  });
}

function renderHabitHistory() {
  const habit = findHabit(uiState.selectedHabitId);
  const isVisible = Boolean(habit);
  elements.historyPanel.classList.toggle("hidden", !isVisible);
  if (!habit) {
    elements.habitHistory.innerHTML = "";
    return;
  }

  const selectedYear = uiState.selectedYear ?? getDefaultHistoryYear(habit);
  const availableYears = getAvailableYears(habit);
  const history = buildYearlyHistory(habit, selectedYear);
  const monthStyle = `grid-template-columns: repeat(${history.totalWeeks}, minmax(10px, 1fr));`;
  const gridStyle = `grid-template-columns: repeat(${history.totalWeeks}, minmax(10px, 1fr));`;
  const selectedStats = getYearSummary(habit, selectedYear);

  elements.habitHistory.innerHTML = `
    <div class="history-layout">
      <div class="history-main">
        <div class="history-summary-row">
          <div>
            <h3>${selectedStats.completedDays} completed days in ${selectedYear}</h3>
            <p>${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)} tracked as ${formatFrequency(habit)}.</p>
          </div>
          <div class="history-stat-chips">
            <span class="meta-chip">${selectedStats.loggedDays} days logged</span>
            <span class="meta-chip">${selectedStats.bestStreak} best streak</span>
          </div>
        </div>

        <div class="history-board">
          <div class="history-months" style="${monthStyle}">
            ${history.monthLabels
              .map((month) => `<span style="grid-column:${month.columnStart} / span ${month.columnSpan}">${month.label}</span>`)
              .join("")}
          </div>
          <div class="history-grid-shell">
            <div class="history-day-labels">
              ${HISTORY_DAY_LABELS.map((day) => `<span style="grid-row:${day.row}">${day.label}</span>`).join("")}
            </div>
            <div class="history-grid" style="${gridStyle}">
              ${history.weeks
                .map(
                  (week) => `
                <div class="history-week">
                  ${week.days
                    .map(
                      (day) => `
                    <div class="history-tile level-${day.level} ${day.inYear ? "" : "history-tile-outside"}" data-tooltip="${day.tooltip}" aria-label="${day.tooltip}"></div>
                  `
                    )
                    .join("")}
                </div>
              `
                )
                .join("")}
            </div>
          </div>
          <div class="history-legend">
            <span>Less</span>
            <div class="history-legend-scale">
              <span class="history-tile level-0"></span>
              <span class="history-tile level-1"></span>
              <span class="history-tile level-2"></span>
              <span class="history-tile level-3"></span>
              <span class="history-tile level-4"></span>
            </div>
            <span>More</span>
          </div>
        </div>
      </div>

      <aside class="history-years">
        ${availableYears
          .map(
            (year) => `
          <button class="year-toggle ${year === selectedYear ? "year-toggle-active" : ""}" type="button" data-history-year="${year}">
            ${year}
          </button>
        `
          )
          .join("")}
      </aside>
    </div>
  `;

  elements.habitHistory.querySelectorAll("[data-history-year]").forEach((button) => {
    button.addEventListener("click", () => selectHistoryYear(Number(button.dataset.historyYear)));
  });
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

function getYearSummary(habit, year) {
  const dates = Object.keys(habit.logs)
    .filter((date) => Number(date.slice(0, 4)) === year)
    .sort();
  let completedDays = 0;
  let bestStreak = 0;
  let runningStreak = 0;

  getDatesForCalendarYear(year).forEach((date) => {
    if (isDayComplete(habit, date)) {
      completedDays += 1;
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  });

  return {
    completedDays,
    loggedDays: dates.length,
    bestStreak
  };
}

function buildRecentTiles(habit) {
  return getDateRange(TILE_DAYS).map((date) => {
    const count = habit.logs[date] || 0;
    const ratio = getCompletionRatio(habit, date);
    const level = getTileLevel(ratio);
    return {
      level,
      tooltip: `${formatDateLong(date)}: ${count} / ${habit.target} ${readableMetricUnit(habit.metric)}`
    };
  });
}

function buildYearlyHistory(habit, year) {
  const firstDay = stripTime(new Date(year, 0, 1));
  const lastDay = stripTime(new Date(year, 11, 31));
  const start = addDays(firstDay, -firstDay.getDay());
  const end = addDays(lastDay, 6 - lastDay.getDay());

  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dateKey = formatDateKey(cursor);
    const inYear = cursor.getFullYear() === year;
    const count = habit.logs[dateKey] || 0;
    const ratio = inYear ? getCompletionRatio(habit, dateKey) : 0;
    days.push({
      dateKey,
      inYear,
      level: inYear ? getTileLevel(ratio) : 0,
      tooltip: `${formatDateLong(dateKey)}: ${count} / ${habit.target} ${readableMetricUnit(habit.metric)}${inYear && isDayComplete(habit, dateKey) ? " complete" : ""}`
    });
  }

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push({ days: days.slice(index, index + 7) });
  }

  const monthStarts = [];
  for (let month = 0; month < 12; month += 1) {
    const monthDate = new Date(year, month, 1);
    monthStarts.push({
      label: monthDate.toLocaleDateString(undefined, { month: "short" }),
      columnStart: Math.floor((stripTime(monthDate) - start) / 86400000 / 7) + 1
    });
  }

  const monthLabels = monthStarts.map((month, index) => ({
    ...month,
    columnSpan: (monthStarts[index + 1]?.columnStart ?? weeks.length + 1) - month.columnStart
  }));

  return {
    weeks,
    monthLabels,
    totalWeeks: weeks.length
  };
}

function getTileLevel(ratio) {
  if (ratio === 0) return 0;
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio < 1.5) return 3;
  return 4;
}

function getAvailableYears(habit) {
  const years = new Set([new Date().getFullYear()]);
  if (habit.createdAt) {
    years.add(new Date(habit.createdAt).getFullYear());
  }

  Object.keys(habit.logs).forEach((date) => years.add(Number(date.slice(0, 4))));

  const sortedYears = Array.from(years).sort((left, right) => right - left);
  const newest = sortedYears[0];
  const oldest = sortedYears[sortedYears.length - 1];
  const expanded = [];
  for (let year = newest; year >= oldest; year -= 1) {
    expanded.push(year);
  }
  return expanded;
}

function getDefaultHistoryYear(habit) {
  return getAvailableYears(habit)[0];
}

function getDatesForCalendarYear(year) {
  const dates = [];
  for (let cursor = new Date(year, 0, 1); cursor.getFullYear() === year; cursor = addDays(cursor, 1)) {
    dates.push(formatDateKey(cursor));
  }
  return dates;
}

function getCompletionRatio(habit, date) {
  return Math.min((habit.logs[date] || 0) / habit.target, 2);
}

function isDayComplete(habit, date) {
  if (habit.frequency === "weekly") {
    const weekDates = getWeekDates(date);
    const weeklyCount = weekDates.reduce((sum, currentDate) => sum + (habit.logs[currentDate] || 0), 0);
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
    return `${habit.target} ${unit} weekly`;
  }
  return `${habit.target} ${unit} custom`;
}

function readableMetricUnit(metric) {
  if (metric === "days-per-week") return "days";
  if (metric === "times-per-week" || metric === "times-per-day") return "times";
  return sanitizeMetric(metric);
}

function sanitizeMetric(metric) {
  const normalized = String(metric || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9 -]/g, "")
    .replaceAll(/\s+/g, " ");
  return normalized || "times";
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
