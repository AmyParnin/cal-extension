// popup.js — Logic for the extension popup window

const nlInput        = document.getElementById("nl-input");
const parseBtn       = document.getElementById("parse-btn");
const titleInput     = document.getElementById("title");
const timedFields    = document.getElementById("timed-fields");
const alldayFields   = document.getElementById("allday-fields");
const taskFields     = document.getElementById("task-fields");
const locationRow    = document.getElementById("location-row");
const dtInput        = document.getElementById("datetime");
const durInput       = document.getElementById("duration");
const startdateInput = document.getElementById("startdate");
const enddateInput   = document.getElementById("enddate");
const taskDateInput  = document.getElementById("task-date");
const taskTimeInput  = document.getElementById("task-time");
const locInput       = document.getElementById("location");
const descInput      = document.getElementById("description");
const createBtn      = document.getElementById("create-btn");
const statusEl       = document.getElementById("status");
const openBtn        = document.getElementById("open-btn");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel  = document.getElementById("settings-panel");
const apiKeyInput    = document.getElementById("api-key-input");
const workspaceInput = document.getElementById("workspace-id-input");
const saveKeyBtn     = document.getElementById("save-key-btn");
const clearKeyBtn    = document.getElementById("clear-key-btn");
const keyInfoBtn     = document.getElementById("key-info-btn");
const keyInfoEl      = document.getElementById("key-info");
const keyStatus      = document.getElementById("key-status");

// ─── Mode Selector ────────────────────────────────────────────────────────────

let currentMode = "timed"; // "timed" | "allday" | "task"

function setMode(mode) {
  currentMode = mode;

  // Update button active states
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  // Show/hide field sections
  timedFields.style.display  = mode === "timed"  ? "" : "none";
  alldayFields.style.display = mode === "allday" ? "" : "none";
  taskFields.style.display   = mode === "task"   ? "" : "none";

  // Tasks don't have a location in the Google Tasks API
  locationRow.style.display = mode === "task" ? "none" : "";

  // Update create button label
  createBtn.textContent = mode === "task"
    ? "Add to Google Tasks"
    : "Add to Google Calendar";

  // Pre-populate task date/time when switching into task mode.
  // Prefer the timed datetime field; fall back to the all-day start date.
  if (mode === "task") {
    if (!taskDateInput.value) {
      taskDateInput.value = dtInput.value
        ? dtInput.value.slice(0, 10)
        : startdateInput.value;
    }
    if (!taskTimeInput.value && dtInput.value) {
      taskTimeInput.value = dtInput.value.slice(11, 16);
    }
  }

  // Pre-populate all-day dates from datetime when switching to allday
  if (mode === "allday" && dtInput.value) {
    const d = dtInput.value.slice(0, 10);
    if (!startdateInput.value) startdateInput.value = d;
    if (!enddateInput.value)   enddateInput.value   = d;
  }
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

// ─── Settings Panel ───────────────────────────────────────────────────────────

// Load saved key + workspace ID on open
chrome.storage.local.get(["apiKey", "workspaceId"], ({ apiKey, workspaceId }) => {
  if (apiKey) {
    apiKeyInput.value         = apiKey;
    keyStatus.textContent     = "✓ Key saved — AI titles enabled";
    keyStatus.style.color     = "#1e8e3e";
    clearKeyBtn.style.display = "";
  }
  if (workspaceId) workspaceInput.value = workspaceId;
});

settingsToggle.addEventListener("click", () => {
  const open = settingsPanel.style.display !== "block";
  settingsPanel.style.display = open ? "block" : "none";
});

keyInfoBtn.addEventListener("click", () => {
  keyInfoEl.style.display = keyInfoEl.style.display === "none" ? "block" : "none";
});

saveKeyBtn.addEventListener("click", () => {
  const key         = apiKeyInput.value.trim();
  const workspaceId = workspaceInput.value.trim();
  if (!key) return;
  const data = { apiKey: key };
  if (workspaceId) data.workspaceId = workspaceId;
  else chrome.storage.local.remove("workspaceId");
  chrome.storage.local.set(data, () => {
    keyStatus.textContent     = "✓ Key saved — AI titles enabled";
    keyStatus.style.color     = "#1e8e3e";
    clearKeyBtn.style.display = "";
  });
});

clearKeyBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["apiKey", "workspaceId"], () => {
    apiKeyInput.value         = "";
    workspaceInput.value      = "";
    keyStatus.textContent     = "Key removed — using built-in parser";
    keyStatus.style.color     = "#5f6368";
    clearKeyBtn.style.display = "none";
  });
});

// Keep end date >= start date
startdateInput.addEventListener("change", () => {
  if (!enddateInput.value || enddateInput.value < startdateInput.value) {
    enddateInput.value = startdateInput.value;
  }
});

// ─── AI Parse ────────────────────────────────────────────────────────────────

const aiErrorEl  = document.getElementById("ai-error");
const aiErrorMsg = document.getElementById("ai-error-msg");

parseBtn.addEventListener("click", async () => {
  const text = nlInput.value.trim();
  if (!text) return;

  parseBtn.disabled = true;
  parseBtn.textContent = "Parsing…";
  aiErrorEl.style.display = "none";

  const response = await sendMessage({ type: "PARSE_TEXT", text });

  parseBtn.disabled = false;
  parseBtn.textContent = "✦ Parse with AI";

  if (response?.success && response.parsed) {
    const e = response.parsed;
    titleInput.value = e.summary  || "";
    locInput.value   = e.location || "";
    descInput.textContent = text; // original text the user typed, not the parsed description

    if (e.aiError) {
      aiErrorMsg.textContent = e.aiError + " · Using built-in title.";
      aiErrorEl.style.display = "";
    }

    if (e.allDay) {
      setMode("allday");
      startdateInput.value = e.start.date;
      enddateInput.value   = e.start.date;
    } else {
      setMode("timed");
      dtInput.value  = toDatetimeLocal(new Date(e.start.dateTime));
      const startMs  = new Date(e.start.dateTime).getTime();
      const endMs    = new Date(e.end.dateTime).getTime();
      durInput.value = Math.round((endMs - startMs) / 60000);
    }
  } else {
    showStatus("Couldn't parse — try rephrasing", "error");
  }
});

// ─── Create Event ─────────────────────────────────────────────────────────────

createBtn.addEventListener("click", async () => {
  const title    = titleInput.value.trim();
  const isAllDay = currentMode === "allday";

  if (!title) { showStatus("Please enter a title", "error"); return; }
  if (currentMode === "allday"  && !startdateInput.value) { showStatus("Please pick a start date", "error");  return; }
  if (currentMode === "timed"   && !dtInput.value)        { showStatus("Please pick a date & time", "error"); return; }
  if (currentMode === "task"    && !taskDateInput.value)  { showStatus("Please pick a due date", "error");    return; }

  createBtn.disabled = true;
  openBtn.style.display = "none";

  if (currentMode === "task") {
    const due = taskTimeInput.value
      ? new Date(`${taskDateInput.value}T${taskTimeInput.value}:00`).toISOString()
      : new Date(`${taskDateInput.value}T00:00:00`).toISOString();

    const task = {
      title,
      notes: getDescriptionValue() || undefined,
      due,
    };

    showStatus("Creating task…", "");
    const response = await sendMessage({ type: "CREATE_TASK", task });
    createBtn.disabled = false;

    if (response?.success) {
      showStatus("✓ Task created!", "success");
      const dismissTimer = setTimeout(() => window.close(), 3000);
      openBtn.style.display = "";
      openBtn.textContent = "Open Tasks ↗";
      openBtn.onclick = () => {
        clearTimeout(dismissTimer);
        chrome.tabs.create({ url: "https://calendar.google.com/calendar/r/tasks" });
        window.close();
      };
    } else {
      showStatus("Error: " + (response?.error || "unknown"), "error");
    }
    return;
  }

  // Calendar event (timed or all-day)
  let event;
  if (isAllDay) {
    const endDate = addDays(enddateInput.value || startdateInput.value, 1);
    event = {
      summary:     title,
      location:    locInput.value.trim()  || undefined,
      description: getDescriptionHtml() || undefined,
      start: { date: startdateInput.value },
      end:   { date: endDate },
    };
  } else {
    const start    = new Date(dtInput.value);
    const duration = parseInt(durInput.value, 10) || 60;
    const end      = new Date(start.getTime() + duration * 60000);
    const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
    event = {
      summary:     title,
      location:    locInput.value.trim()  || undefined,
      description: getDescriptionHtml() || undefined,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end:   { dateTime: end.toISOString(),   timeZone: tz },
    };
  }

  showStatus("Creating event…", "");
  const response = await sendMessage({ type: "CREATE_EVENT", event });
  createBtn.disabled = false;

  if (response?.success) {
    showStatus("✓ Event created!", "success");
    const dismissTimer = setTimeout(() => window.close(), 3000);
    const htmlLink = response.result?.htmlLink;
    if (htmlLink) {
      openBtn.style.display = "";
      openBtn.textContent = "Open in Calendar ↗";
      openBtn.onclick = () => {
        clearTimeout(dismissTimer);
        chrome.tabs.create({ url: htmlLink });
        window.close();
      };
    }
  } else {
    showStatus("Error: " + (response?.error || "unknown"), "error");
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns the Notes field as HTML for the Google Calendar description field,
// which renders HTML including clickable links in the event view.
// Strips unsafe elements before sending.
function getDescriptionHtml() {
  const clone = descInput.cloneNode(true);
  clone.querySelectorAll("script, style, meta").forEach((n) => n.remove());
  return clone.innerHTML.trim();
}

// Returns Notes as plain text with links as "text (url)".
// Used for Google Tasks notes (Tasks API is plain text only).
function getDescriptionValue() {
  const clone = descInput.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p, div").forEach((b) => { if (b.nextSibling) b.after("\n"); });
  clone.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href || a.getAttribute("href") || "";
    const linkText = a.textContent.trim();
    const text = linkText && linkText !== href ? `${linkText} (${href})` : href;
    if (text) a.replaceWith(text);
  });
  return clone.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className   = type;
}

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Adds `days` to a "YYYY-MM-DD" string and returns a new "YYYY-MM-DD" string.
// Uses local date arithmetic to avoid UTC-midnight timezone shifts.
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const result = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`;
}
