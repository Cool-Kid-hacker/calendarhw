// =========================================================
// CONSTANTS & HELPERS
// =========================================================
const DEFAULT_CHANNEL = "syed-calendar-tab-a8";
const SYNC_STORAGE_KEY = "syed_tab_sync_channel";
const EVENTS_STORAGE_KEY = "syed_tab_calendar_events";

const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const SAMSUNG_CALENDAR_PACKAGE = "com.samsung.android.calendar";
const ANDROID_INTENT_ACTION_INSERT = "android.intent.action.INSERT";
const CALENDAR_EVENT_TYPE = "vnd.android.cursor.dir/event";
const CALENDAR_EVENTS_CONTENT_URI = "content://com.android.calendar/events";

const CATEGORY_NAMES = {
  homework: "📚 Homework",
  exam: "📝 Exam",
  project: "🎨 Project",
  class: "🏫 Class",
  reminder: "⏰ Reminder",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseLocalDate(dateValue, timeValue = "00:00") {
  if (!dateValue || typeof dateValue !== "string" || !dateValue.includes("-")) {
    dateValue = todayInputValue();
  }
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours = 0, minutes = 0] = (timeValue || "00:00").split(":").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addOneHour(timeValue) {
  if (!timeValue || typeof timeValue !== "string" || !timeValue.includes(":")) {
    return "10:00";
  }
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours + 1, minutes || 0, 0, 0);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatIcsDate(dateValue) {
  return dateValue.replaceAll("-", "");
}

function formatIcsDateTime(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    pad(date.getMinutes()),
    "00",
  ].join("");
}

function formatUtcDateTime(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line) {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

function encodeIntentValue(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

// =========================================================
// APPLICATION STATE
// =========================================================
const todayDate = new Date();
const state = {
  syncChannel: localStorage.getItem(SYNC_STORAGE_KEY) || DEFAULT_CHANNEL,
  events: loadSavedEvents(),
  currentYear: todayDate.getFullYear(),
  currentMonth: todayDate.getMonth(), // 0-indexed
  selectedDateStr: null, // filter for agenda
  sseSource: null,
};

function loadSavedEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to parse saved events:", e);
  }
  // Default starter events for nice display
  const yyyy = todayDate.getFullYear();
  const mm = pad(todayDate.getMonth() + 1);
  const dd = pad(todayDate.getDate());
  return [
    {
      id: "demo-1",
      title: "Math Homework Assignment",
      date: `${yyyy}-${mm}-${dd}`,
      allDay: false,
      startTime: "09:00",
      endTime: "10:00",
      category: "homework",
      location: "Room 204",
      notes: "Finish problems 1 through 15",
      createdAt: Date.now(),
    },
    {
      id: "demo-2",
      title: "Science Project Prep",
      date: `${yyyy}-${mm}-${dd}`,
      allDay: false,
      startTime: "14:00",
      endTime: "15:30",
      category: "project",
      location: "Lab Room B",
      notes: "Bring presentation poster",
      createdAt: Date.now(),
    }
  ];
}

function saveEvents() {
  try {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(state.events));
  } catch (e) {
    console.warn("Failed to persist events:", e);
  }
}

// =========================================================
// DOM ELEMENTS
// =========================================================
// Global Header
const viewDashboardBtn = document.querySelector("#viewDashboardBtn");
const viewMakerBtn = document.querySelector("#viewMakerBtn");
const dashboardView = document.querySelector("#dashboardView");
const makerView = document.querySelector("#makerView");
const syncPillBtn = document.querySelector("#syncPillBtn");
const syncPillText = document.querySelector("#syncPillText");
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const liveToast = document.querySelector("#liveToast");
const toastTitle = document.querySelector("#toastTitle");
const toastMessage = document.querySelector("#toastMessage");

// Channel Modal
const channelModal = document.querySelector("#channelModal");
const channelInput = document.querySelector("#channelInput");
const saveChannelBtn = document.querySelector("#saveChannelBtn");
const closeChannelBtn = document.querySelector("#closeChannelBtn");

// Live Dashboard View
const prevMonthBtn = document.querySelector("#prevMonthBtn");
const nextMonthBtn = document.querySelector("#nextMonthBtn");
const todayBtn = document.querySelector("#todayBtn");
const dashMonthYear = document.querySelector("#dashMonthYear");
const dashCalendarGrid = document.querySelector("#dashCalendarGrid");
const dashClockTime = document.querySelector("#dashClockTime");
const dashClockDate = document.querySelector("#dashClockDate");
const agendaHeading = document.querySelector("#agendaHeading");
const clearFilterBtn = document.querySelector("#clearFilterBtn");
const dashAgendaList = document.querySelector("#dashAgendaList");

// Remote Event Maker View
const form = document.querySelector("#eventForm");
const titleInput = document.querySelector("#eventTitle");
const dateInput = document.querySelector("#eventDate");
const allDayInput = document.querySelector("#allDay");
const startTimeInput = document.querySelector("#startTime");
const endTimeInput = document.querySelector("#endTime");
const locationInput = document.querySelector("#eventLocation");
const notesInput = document.querySelector("#eventNotes");
const statusMessage = document.querySelector("#statusMessage");
const previewMonth = document.querySelector("#previewMonth");
const previewDay = document.querySelector("#previewDay");
const previewCategoryBadge = document.querySelector("#previewCategoryBadge");
const previewTime = document.querySelector("#previewTime");
const previewTitle = document.querySelector("#previewTitle");
const previewMeta = document.querySelector("#previewMeta");
const openCalendarButton = document.querySelector("#openCalendarButton");
const downloadButton = document.querySelector("#downloadButton");
const shareButton = document.querySelector("#shareButton");

// =========================================================
// REAL-TIME SYNC ENGINE (SSE via ntfy.sh)
// =========================================================
function getCleanTopic(channel) {
  return String(channel || DEFAULT_CHANNEL).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || DEFAULT_CHANNEL;
}

function connectSyncStream() {
  if (state.sseSource) {
    state.sseSource.close();
    state.sseSource = null;
  }

  const topic = getCleanTopic(state.syncChannel);
  syncPillText.textContent = `Sync: ${topic}`;

  const sseUrl = `https://ntfy.sh/${encodeURIComponent(topic)}/sse`;

  try {
    const source = new EventSource(sseUrl);
    state.sseSource = source;

    source.onopen = () => {
      syncPillBtn.classList.remove("is-offline");
      syncPillBtn.title = `Connected to cloud sync channel: ${topic}`;
    };

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // ntfy wraps message body in 'message' field if sent via POST
        const rawMessage = payload.message || payload;
        const msg = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;

        if (msg && msg.action === "add-event" && msg.event) {
          handleIncomingEvent(msg.event);
        } else if (msg && msg.action === "delete-event" && msg.id) {
          handleIncomingDelete(msg.id);
        }
      } catch {
        // Heartbeat or non-json message, safe to ignore
      }
    };

    source.onerror = () => {
      syncPillBtn.classList.add("is-offline");
      syncPillBtn.title = "Connecting to cloud sync...";
    };
  } catch (err) {
    console.warn("EventSource setup failed:", err);
    syncPillBtn.classList.add("is-offline");
  }
}

function handleIncomingEvent(incomingEvent) {
  const exists = state.events.some((ev) => ev.id === incomingEvent.id);
  if (exists) return;

  state.events.push(incomingEvent);
  saveEvents();
  renderDashboardCalendar();
  renderAgendaList();

  showToast("✨ New Event Received!", `${incomingEvent.title} was added from remote computer`);
}

function handleIncomingDelete(id) {
  state.events = state.events.filter((ev) => ev.id !== id);
  saveEvents();
  renderDashboardCalendar();
  renderAgendaList();
}

async function publishEventToCloud(eventObj) {
  const topic = getCleanTopic(state.syncChannel);
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;

  const body = JSON.stringify({
    action: "add-event",
    event: eventObj,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Cloud relay responded with ${response.status}`);
  }
}

async function publishDeleteToCloud(id) {
  const topic = getCleanTopic(state.syncChannel);
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;

  const body = JSON.stringify({
    action: "delete-event",
    id,
  });

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    console.warn("Cloud delete failed:", e);
  }
}

let toastTimer = null;
function showToast(title, message) {
  if (!liveToast) return;
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  liveToast.classList.remove("is-hidden");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    liveToast.classList.add("is-hidden");
  }, 4500);
}

// =========================================================
// LIVE CLOCK WIDGET
// =========================================================
function updateClock() {
  const now = new Date();
  if (dashClockTime) {
    dashClockTime.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  if (dashClockDate) {
    dashClockDate.textContent = FULL_DATE_FORMATTER.format(now);
  }
}

setInterval(updateClock, 1000);
updateClock();

// =========================================================
// DASHBOARD CALENDAR GRID RENDERER
// =========================================================
function renderDashboardCalendar() {
  if (!dashCalendarGrid || !dashMonthYear) return;

  const year = state.currentYear;
  const month = state.currentMonth;
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const displayDate = new Date(year, month, 1);
  dashMonthYear.textContent = MONTH_FORMATTER.format(displayDate);

  const todayStr = todayInputValue();
  dashCalendarGrid.innerHTML = "";

  // Days from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(dayNum)}`;
    dashCalendarGrid.appendChild(createDayCell(dayNum, dateStr, true));
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === state.selectedDateStr;
    dashCalendarGrid.appendChild(createDayCell(d, dateStr, false, isToday, isSelected));
  }

  // Days from next month to fill grid row
  const totalCells = firstDayIndex + daysInMonth;
  const nextDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let n = 1; n <= nextDays; n++) {
    const nextDate = new Date(year, month + 1, n);
    const dateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(n)}`;
    dashCalendarGrid.appendChild(createDayCell(n, dateStr, true));
  }
}

function createDayCell(dayNum, dateStr, isOtherMonth, isToday = false, isSelected = false) {
  const dayEl = document.createElement("div");
  dayEl.className = "dash-day";
  if (isOtherMonth) dayEl.classList.add("is-other-month");
  if (isToday) dayEl.classList.add("is-today");
  if (isSelected) dayEl.classList.add("is-selected");

  // Day Header (Number + Event count)
  const header = document.createElement("div");
  header.className = "day-header";

  const numSpan = document.createElement("span");
  numSpan.className = "day-number";
  numSpan.textContent = dayNum;
  header.appendChild(numSpan);

  // Events on this day
  const dayEvents = state.events.filter((ev) => ev.date === dateStr);
  if (dayEvents.length > 0) {
./ngrok config add-authtoken YOUR_TOKEN_HERE    const countSpan = document.createElement("span");
    countSpan.className = "day-event-count";
    countSpan.textContent = dayEvents.length;
    header.appendChild(countSpan);
  }

  dayEl.appendChild(header);

  // Event chips container
  const eventsContainer = document.createElement("div");
  eventsContainer.className = "day-events-container";

  dayEvents.slice(0, 2).forEach((ev) => {
    const chip = document.createElement("div");
    chip.className = `event-chip cat-${ev.category || "homework"}`;
    chip.textContent = ev.title;
    eventsContainer.appendChild(chip);
  });

  if (dayEvents.length > 2) {
    const moreChip = document.createElement("div");
    moreChip.className = "event-chip";
    moreChip.style.opacity = "0.7";
    moreChip.textContent = `+${dayEvents.length - 2} more`;
    eventsContainer.appendChild(moreChip);
  }

  dayEl.appendChild(eventsContainer);

  dayEl.addEventListener("click", () => {
    if (state.selectedDateStr === dateStr) {
      state.selectedDateStr = null;
    } else {
      state.selectedDateStr = dateStr;
    }
    renderDashboardCalendar();
    renderAgendaList();
  });

  return dayEl;
}

// =========================================================
// AGENDA EVENTS LIST RENDERER
// =========================================================
function renderAgendaList() {
  if (!dashAgendaList) return;
  dashAgendaList.innerHTML = "";

  let list = [...state.events];

  if (state.selectedDateStr) {
    list = list.filter((ev) => ev.date === state.selectedDateStr);
    agendaHeading.textContent = `Events on ${state.selectedDateStr}`;
    clearFilterBtn.classList.remove("is-hidden");
  } else {
    agendaHeading.textContent = "Upcoming Events";
    clearFilterBtn.classList.add("is-hidden");
  }

  // Sort chronologically
  list.sort((a, b) => {
    const aTime = `${a.date}T${a.startTime || "00:00"}`;
    const bTime = `${b.date}T${b.startTime || "00:00"}`;
    return aTime.localeCompare(bTime);
  });

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "agenda-empty";
    empty.textContent = state.selectedDateStr ? "No events scheduled for this day." : "No upcoming events yet. Push an event from any computer!";
    dashAgendaList.appendChild(empty);
    return;
  }

  list.forEach((ev) => {
    const card = document.createElement("div");
    card.className = "agenda-card";

    const top = document.createElement("div");
    top.className = "card-top";

    const badge = document.createElement("span");
    badge.className = `cat-tag cat-${ev.category || "homework"}`;
    badge.textContent = CATEGORY_NAMES[ev.category] || "📚 Event";
    top.appendChild(badge);

    const time = document.createElement("span");
    time.className = "card-time";
    time.textContent = ev.allDay ? "All day" : `${ev.startTime} - ${ev.endTime}`;
    top.appendChild(time);

    card.appendChild(top);

    const title = document.createElement("h4");
    title.className = "card-title";
    title.textContent = ev.title;
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const metaParts = [`📅 ${ev.date}`];
    if (ev.location) metaParts.push(`📍 ${ev.location}`);
    if (ev.notes) metaParts.push(`📝 ${ev.notes}`);
    meta.textContent = metaParts.join(" • ");
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const delBtn = document.createElement("button");
    delBtn.className = "card-del-btn";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      state.events = state.events.filter((item) => item.id !== ev.id);
      saveEvents();
      publishDeleteToCloud(ev.id);
      renderDashboardCalendar();
      renderAgendaList();
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    dashAgendaList.appendChild(card);
  });
}

// =========================================================
// EVENT FORM & PREVIEW LOGIC
// =========================================================
function getSelectedCategory() {
  const checked = document.querySelector('input[name="eventCategory"]:checked');
  return checked ? checked.value : "homework";
}

function getEventDetails() {
  const title = (titleInput.value || "").trim();
  const date = dateInput.value;
  const allDay = allDayInput.checked;
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;
  const location = (locationInput.value || "").trim();
  const notes = (notesInput.value || "").trim();
  const category = getSelectedCategory();

  if (!title || !date || (!allDay && (!startTime || !endTime))) {
    return null;
  }

  const start = parseLocalDate(date, allDay ? "00:00" : startTime);
  let end = allDay ? parseLocalDate(date, "00:00") : parseLocalDate(date, endTime);

  if (allDay) {
    end.setDate(end.getDate() + 1);
  } else if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    date,
    allDay,
    startTime,
    endTime,
    location,
    notes,
    category,
    start,
    end,
    createdAt: Date.now(),
  };
}

function updatePreview() {
  const dateValue = dateInput.value || todayInputValue();
  const displayDate = parseLocalDate(dateValue);
  const title = (titleInput.value || "").trim() || "Class project";
  const location = (locationInput.value || "").trim();
  const allDay = allDayInput.checked;
  const category = getSelectedCategory();

  previewMonth.textContent = MONTH_FORMATTER.format(displayDate);
  previewDay.textContent = String(displayDate.getDate());
  previewTitle.textContent = title;
  previewMeta.textContent = location || "No location";

  if (previewCategoryBadge) {
    previewCategoryBadge.textContent = CATEGORY_NAMES[category] || "📚 Homework";
    previewCategoryBadge.className = `cat-tag cat-${category}`;
  }

  startTimeInput.disabled = allDay;
  endTimeInput.disabled = allDay;
  startTimeInput.required = !allDay;
  endTimeInput.required = !allDay;

  if (allDay) {
    previewTime.textContent = "All day";
  } else {
    const start = parseLocalDate(dateValue, startTimeInput.value || "09:00");
    const end = parseLocalDate(dateValue, endTimeInput.value || "10:00");
    if (end <= start) {
      end.setDate(end.getDate() + 1);
      previewTime.textContent = `${TIME_FORMATTER.format(start)} - ${TIME_FORMATTER.format(end)} (+1 day)`;
    } else {
      previewTime.textContent = `${TIME_FORMATTER.format(start)} - ${TIME_FORMATTER.format(end)}`;
    }
  }

  document.body.classList.toggle("all-day-mode", allDay);
}

function keepEndAfterStart() {
  if (allDayInput.checked || !startTimeInput.value || !endTimeInput.value) {
    return;
  }

  const start = parseLocalDate(dateInput.value || todayInputValue(), startTimeInput.value);
  const end = parseLocalDate(dateInput.value || todayInputValue(), endTimeInput.value);

  if (end <= start) {
    endTimeInput.value = addOneHour(startTimeInput.value);
  }
}

function setStatus(message, isError = false, isSuccess = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
  statusMessage.classList.toggle("success", isSuccess);
}

// =========================================================
// ICS FILE & ANDROID INTENT GENERATION
// =========================================================
function buildIcs(details) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendar HW//Samsung Event Maker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${details.id || Date.now()}@calendarhw.local`,
    `DTSTAMP:${formatUtcDateTime(new Date())}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
  ];

  if (details.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(details.date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(details.date)}`);
  } else {
    lines.push(`DTSTART:${formatIcsDateTime(details.start)}`);
    lines.push(`DTEND:${formatIcsDateTime(details.end)}`);
  }

  if (details.location) {
    lines.push(`LOCATION:${escapeIcsText(details.location)}`);
  }

  if (details.notes) {
    lines.push(`DESCRIPTION:${escapeIcsText(details.notes)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function makeFileName(details) {
  const safeTitle = details.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36) || "calendar-event";

  return `${safeTitle}-${details.date}.ics`;
}

function buildCalendarFile(details) {
  return new File([buildIcs(details)], makeFileName(details), { type: "text/calendar;charset=utf-8" });
}

function downloadEventFile() {
  const details = getEventDetails();
  if (!details) {
    setStatus("Add a title and date first.", true);
    form.reportValidity();
    return;
  }

  const file = buildCalendarFile(details);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus("Event file downloaded.", false, true);
}

function buildAndroidCalendarIntent(details, packageName = "") {
  const [year, month, day] = details.date.split("-").map(Number);
  const beginTime = details.allDay ? Date.UTC(year, month - 1, day) : details.start.getTime();
  const endTime = details.allDay ? Date.UTC(year, month - 1, day + 1) : details.end.getTime();

  const intentParts = [
    `action=${ANDROID_INTENT_ACTION_INSERT}`,
    `type=${CALENDAR_EVENT_TYPE}`,
    `S.title=${encodeIntentValue(details.title)}`,
    `l.beginTime=${beginTime}`,
    `l.endTime=${endTime}`,
    `b.allDay=${details.allDay}`,
  ];

  if (details.location) {
    intentParts.push(`S.eventLocation=${encodeIntentValue(details.location)}`);
  }
  if (details.notes) {
    intentParts.push(`S.description=${encodeIntentValue(details.notes)}`);
  }
  if (packageName) {
    intentParts.push(`package=${packageName}`);
  }
  intentParts.push("end");

  return `intent:#Intent;${intentParts.join(";")}`;
}

function openCalendarOnAndroid(details) {
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (!isAndroid) {
    setStatus("Android calendar launch is for mobile/tablets. Event file downloaded as fallback.", false);
    downloadEventFile();
    return;
  }

  const fallbackIntent = buildAndroidCalendarIntent(details);
  const samsungIntent = buildAndroidCalendarIntent(details, SAMSUNG_CALENDAR_PACKAGE);
  let fallbackTimer = 0;

  const cancelFallback = () => {
    clearTimeout(fallbackTimer);
    document.removeEventListener("visibilitychange", cancelFallback);
    window.removeEventListener("pagehide", cancelFallback);
  };

  document.addEventListener("visibilitychange", cancelFallback);
  window.addEventListener("pagehide", cancelFallback);
  fallbackTimer = window.setTimeout(() => {
    if (!document.hidden) {
      window.location.href = fallbackIntent;
    }
    cancelFallback();
  }, 900);

  setStatus("Opening Samsung Calendar...", false, true);
  window.location.href = samsungIntent;
}

async function shareEventFile() {
  const details = getEventDetails();
  if (!details) {
    setStatus("Add a title and date first.", true);
    form.reportValidity();
    return;
  }

  const file = buildCalendarFile(details);
  try {
    await navigator.share({
      title: details.title,
      text: details.title,
      files: [file],
    });
    setStatus("Event shared.", false, true);
  } catch (error) {
    if (error && error.name !== "AbortError") {
      downloadEventFile();
    }
  }
}

// =========================================================
// SETUP DEFAULTS & EVENT LISTENERS
// =========================================================
function setupDefaults() {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  dateInput.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  startTimeInput.value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  endTimeInput.value = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  if (typeof window !== "undefined" && window.File && typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
    try {
      const testFile = new File(["test"], "event.ics", { type: "text/calendar" });
      if (navigator.canShare({ files: [testFile] })) {
        shareButton.classList.remove("is-hidden");
      }
    } catch {
      // ignore
    }
  }

  updatePreview();
  renderDashboardCalendar();
  renderAgendaList();
  connectSyncStream();
}

// Mode Switching (Live Display vs Add Event)
viewDashboardBtn.addEventListener("click", () => {
  viewDashboardBtn.classList.add("is-active");
  viewMakerBtn.classList.remove("is-active");
  dashboardView.classList.remove("is-hidden");
  makerView.classList.add("is-hidden");
  renderDashboardCalendar();
  renderAgendaList();
});

viewMakerBtn.addEventListener("click", () => {
  viewMakerBtn.classList.add("is-active");
  viewDashboardBtn.classList.remove("is-active");
  makerView.classList.remove("is-hidden");
  dashboardView.classList.add("is-hidden");
  updatePreview();
});

// Fullscreen Button
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Calendar Month Controls
prevMonthBtn.addEventListener("click", () => {
  state.currentMonth--;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear--;
  }
  renderDashboardCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  state.currentMonth++;
  if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear++;
  }
  renderDashboardCalendar();
});

todayBtn.addEventListener("click", () => {
  const now = new Date();
  state.currentYear = now.getFullYear();
  state.currentMonth = now.getMonth();
  state.selectedDateStr = null;
  renderDashboardCalendar();
  renderAgendaList();
});

clearFilterBtn.addEventListener("click", () => {
  state.selectedDateStr = null;
  renderDashboardCalendar();
  renderAgendaList();
});

// Channel Modal
syncPillBtn.addEventListener("click", () => {
  channelInput.value = state.syncChannel;
  channelModal.classList.remove("is-hidden");
  channelInput.focus();
});

closeChannelBtn.addEventListener("click", () => {
  channelModal.classList.add("is-hidden");
});

saveChannelBtn.addEventListener("click", () => {
  const val = channelInput.value.trim();
  if (val) {
    state.syncChannel = val;
    localStorage.setItem(SYNC_STORAGE_KEY, val);
    connectSyncStream();
  }
  channelModal.classList.add("is-hidden");
});

// Form Submission (Push to Tablet Calendar)
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const details = getEventDetails();
  if (!details) {
    setStatus("Add a title and date first.", true);
    form.reportValidity();
    return;
  }

  setStatus("Broadcasting to tablet...", false);

  try {
    await publishEventToCloud(details);

    // Save locally too
    if (!state.events.some((e) => e.id === details.id)) {
      state.events.push(details);
      saveEvents();
    }

    renderDashboardCalendar();
    renderAgendaList();
    setStatus("🚀 Pushed to tablet! Event is now live on the calendar display.", false, true);
    showToast("🚀 Event Sent!", `"${details.title}" pushed to your tablet`);

    // Reset title and notes for quick entry
    titleInput.value = "";
    notesInput.value = "";
    updatePreview();
  } catch (err) {
    console.error(err);
    setStatus("Offline: Event saved locally on this device.", false);
    if (!state.events.some((e) => e.id === details.id)) {
      state.events.push(details);
      saveEvents();
      renderDashboardCalendar();
      renderAgendaList();
    }
  }
});

// Secondary Button Actions
openCalendarButton.addEventListener("click", () => {
  const details = getEventDetails();
  if (!details) {
    setStatus("Add a title and date first.", true);
    form.reportValidity();
    return;
  }
  openCalendarOnAndroid(details);
});

downloadButton.addEventListener("click", downloadEventFile);
shareButton.addEventListener("click", shareEventFile);

// Form Reactive Inputs
allDayInput.addEventListener("change", updatePreview);
startTimeInput.addEventListener("input", () => { keepEndAfterStart(); updatePreview(); });
startTimeInput.addEventListener("change", () => { keepEndAfterStart(); updatePreview(); });
endTimeInput.addEventListener("input", updatePreview);
endTimeInput.addEventListener("change", updatePreview);
dateInput.addEventListener("input", updatePreview);
dateInput.addEventListener("change", updatePreview);

document.querySelectorAll('input[name="eventCategory"]').forEach((radio) => {
  radio.addEventListener("change", updatePreview);
});

[titleInput, locationInput, notesInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (statusMessage.classList.contains("error") && getEventDetails()) {
      setStatus("");
    }
    updatePreview();
  });
});

// Initialize on DOM load
setupDefaults();
