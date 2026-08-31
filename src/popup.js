// popup.js — Logic for the extension popup window

const nlInput        = document.getElementById("nl-input");
const parseBtn       = document.getElementById("parse-btn");
const titleInput     = document.getElementById("title");
const alldayCheck    = document.getElementById("allday");
const timedFields    = document.getElementById("timed-fields");
const alldayFields   = document.getElementById("allday-fields");
const dtInput        = document.getElementById("datetime");
const durInput       = document.getElementById("duration");
const startdateInput = document.getElementById("startdate");
const enddateInput   = document.getElementById("enddate");
const locInput       = document.getElementById("location");
const descInput      = document.getElementById("description");
const createBtn      = document.getElementById("create-btn");
const statusEl       = document.getElementById("status");
const openBtn        = document.getElementById("open-btn");

// ─── All-day Toggle ───────────────────────────────────────────────────────────

alldayCheck.addEventListener("change", () => {
  const isAllDay = alldayCheck.checked;
  timedFields.style.display  = isAllDay ? "none" : "";
  alldayFields.style.display = isAllDay ? "" : "none";

  // Pre-populate start/end date from the datetime field if already set
  if (isAllDay && dtInput.value) {
    const d = dtInput.value.slice(0, 10); // "YYYY-MM-DD"
    startdateInput.value = d;
    enddateInput.value   = d;
  }
});

// Keep end date >= start date
startdateInput.addEventListener("change", () => {
  if (!enddateInput.value || enddateInput.value < startdateInput.value) {
    enddateInput.value = startdateInput.value;
  }
});

// ─── AI Parse ────────────────────────────────────────────────────────────────

parseBtn.addEventListener("click", async () => {
  const text = nlInput.value.trim();
  if (!text) return;

  parseBtn.disabled = true;
  parseBtn.textContent = "Parsing…";

  const response = await sendMessage({ type: "PARSE_TEXT", text });

  parseBtn.disabled = false;
  parseBtn.textContent = "✦ Parse with AI";

  if (response?.success && response.parsed) {
    const e = response.parsed;
    titleInput.value = e.summary  || "";
    locInput.value   = e.location || "";
    descInput.value  = e.description || "";

    if (e.allDay) {
      alldayCheck.checked        = true;
      timedFields.style.display  = "none";
      alldayFields.style.display = "";
      startdateInput.value = e.start.date;
      // Show the same date as end (API end is exclusive; we add 1 day on submit)
      enddateInput.value   = e.start.date;
    } else {
      alldayCheck.checked        = false;
      timedFields.style.display  = "";
      alldayFields.style.display = "none";
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
  const isAllDay = alldayCheck.checked;

  if (!title)                          { showStatus("Please enter a title", "error");       return; }
  if (isAllDay && !startdateInput.value) { showStatus("Please pick a start date", "error"); return; }
  if (!isAllDay && !dtInput.value)     { showStatus("Please pick a date & time", "error"); return; }

  let event;

  if (isAllDay) {
    // Google Calendar all-day events use { date: "YYYY-MM-DD" }.
    // end.date is exclusive, so add 1 day past whatever the user picked.
    const endDate = addDays(enddateInput.value || startdateInput.value, 1);
    event = {
      summary:     title,
      location:    locInput.value.trim()  || undefined,
      description: descInput.value.trim() || undefined,
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
      description: descInput.value.trim() || undefined,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end:   { dateTime: end.toISOString(),   timeZone: tz },
    };
  }

  createBtn.disabled = true;
  openBtn.style.display = "none";
  showStatus("Creating event…", "");

  const response = await sendMessage({ type: "CREATE_EVENT", event });

  createBtn.disabled = false;

  if (response?.success) {
    showStatus("✓ Event created!", "success");

    const dismissTimer = setTimeout(() => window.close(), 3000);

    const htmlLink = response.result?.htmlLink;
    if (htmlLink) {
      openBtn.style.display = "";
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
