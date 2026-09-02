// content.js — Injected into every webpage
// Handles: showing the event preview bubble after right-click → "Create Calendar event"

let previewBubble = null;
let savedSelectionText = "";

// Capture phase (true) fires before any page handler can call stopPropagation,
// ensuring we always capture the selection when the context menu opens.
document.addEventListener("contextmenu", () => {
  savedSelectionText = getSelectionAsText();
}, true);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SHOW_EVENT_PREVIEW") {
    // Fall back to Chrome's plain selectionText if our capture returned empty
    const notesText = savedSelectionText || message.text;
    savedSelectionText = "";
    showPreviewBubble(message.text, message.pageUrl, message.pageTitle, notesText);
  }
});

function showPreviewBubble(text, pageUrl, pageTitle, notesText) {
  if (previewBubble) previewBubble.remove();

  chrome.runtime.sendMessage({ type: "PARSE_TEXT", text }, (response) => {
    if (!response?.success) {
      alert("Couldn't parse event: " + (response?.error || "unknown error"));
      return;
    }

    const event = response.parsed;
    event.source = { title: pageTitle, url: pageUrl };

    previewBubble = createBubble(event, notesText);
    document.body.appendChild(previewBubble);

    if (event.aiError) {
      const errEl = previewBubble.querySelector("#sc-ai-error");
      const msgEl = previewBubble.querySelector("#sc-ai-error-msg");
      if (errEl && msgEl) {
        msgEl.textContent = event.aiError + " · Using built-in title.";
        errEl.style.display = "";
      }
    }
  });
}

function createBubble(event, notesText) {
  const bubble = document.createElement("div");
  bubble.id = "smart-cal-bubble";

  Object.assign(bubble.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
    padding: "16px 20px",
    fontFamily: "Google Sans, Roboto, sans-serif",
    fontSize: "14px",
    minWidth: "280px",
    maxWidth: "360px",
    color: "#202124",
  });

  const isAllDay    = event.allDay === true;
  const datetimeVal = isAllDay ? "" : toDatetimeLocal(new Date(event.start.dateTime));
  const dateVal     = isAllDay ? event.start.date : "";

  const initialMode = isAllDay ? "allday" : "timed";
  const modeStyle = (m) => `flex:1;padding:6px 4px;border:none;border-right:1px solid #dadce0;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap;transition:background 0.1s;`;
  const activeStyle = `background:#fde8e6;color:#c0394b;font-weight:600;`;
  const inactiveStyle = `background:#fff;color:#5f6368;`;

  bubble.innerHTML = `
    <div style="font-weight:600;font-size:15px;margin-bottom:10px">📅 New Calendar Event</div>

    <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Title</label>
    <input id="sc-title" value="${escHtml(event.summary)}"
      style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:6px">
    <div id="sc-ai-error" style="display:none;font-size:11px;color:#d93025;margin-bottom:8px;line-height:1.5">
      ⚠ <span id="sc-ai-error-msg"></span>
    </div>

    <p style="font-size:11px;color:#5f6368;margin-bottom:4px">Type</p>
    <div style="display:flex;border:1px solid #dadce0;border-radius:8px;overflow:hidden;margin-bottom:10px">
      <button id="sc-mode-timed"  data-mode="timed"  style="${modeStyle()}${initialMode==='timed'  ? activeStyle : inactiveStyle}">⏰ Timed event</button>
      <button id="sc-mode-allday" data-mode="allday" style="${modeStyle()}${initialMode==='allday' ? activeStyle : inactiveStyle}">📅 All-day</button>
      <button id="sc-mode-task"   data-mode="task"   style="${modeStyle()}border-right:none;${initialMode==='task'   ? activeStyle : inactiveStyle}">✓ Task</button>
    </div>

    <div id="sc-timed" style="display:${isAllDay ? "none" : "block"}">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Date &amp; Time</label>
      <input id="sc-datetime" type="datetime-local" value="${datetimeVal}"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:8px">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Duration (minutes)</label>
      <input id="sc-duration" type="number" value="60" min="5" step="5"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:10px">
    </div>

    <div id="sc-allday-fields" style="display:${isAllDay ? "block" : "none"}">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Start Date</label>
      <input id="sc-startdate" type="date" value="${dateVal}"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:8px">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">End Date</label>
      <input id="sc-enddate" type="date" value="${dateVal}"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:10px">
    </div>

    <div id="sc-task-fields" style="display:none">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Due date</label>
      <input id="sc-task-date" type="date"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:8px">
      <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Due time (optional)</label>
      <input id="sc-task-time" type="time"
        style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:10px">
    </div>

    <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Notes</label>
    <div id="sc-description" contenteditable="true"
      style="width:100%;box-sizing:border-box;min-height:60px;max-height:150px;overflow-y:auto;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:13px;font-family:inherit;line-height:1.5;margin-bottom:10px;cursor:text;word-break:break-word;color:#202124;outline:none"></div>

    <div style="display:flex;gap:8px">
      <button id="sc-confirm"
        style="flex:1;padding:8px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">
        Add to Calendar
      </button>
      <button id="sc-cancel"
        style="padding:8px 12px;background:none;border:1px solid #dadce0;border-radius:6px;cursor:pointer;font-size:14px">
        ✕
      </button>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;min-height:26px">
      <span id="sc-status" style="font-size:12px;flex:1"></span>
      <button id="sc-open"
        style="display:none;padding:4px 10px;background:#fff;color:#1a73e8;border:1px solid #1a73e8;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap">
        Open in Calendar ↗
      </button>
    </div>
  `;

  // ── Pre-fill notes with selected text
  const descEl = bubble.querySelector("#sc-description");
  if (notesText) descEl.textContent = notesText;

  // Highlight border on focus (can't use :focus CSS in inline-styled injected element)
  descEl.addEventListener("focus", () => { descEl.style.borderColor = "#1a73e8"; });
  descEl.addEventListener("blur",  () => { descEl.style.borderColor = "#dadce0"; });

  // ── Mode selector ─────────────────────────────────────────────────────────────
  const timedDiv     = bubble.querySelector("#sc-timed");
  const alldayDiv    = bubble.querySelector("#sc-allday-fields");
  const taskDiv      = bubble.querySelector("#sc-task-fields");
  const dtInput      = bubble.querySelector("#sc-datetime");
  const startInput   = bubble.querySelector("#sc-startdate");
  const endInput     = bubble.querySelector("#sc-enddate");
  const taskDateInp  = bubble.querySelector("#sc-task-date");
  const taskTimeInp  = bubble.querySelector("#sc-task-time");
  const confirmBtn   = bubble.querySelector("#sc-confirm");

  let currentMode = initialMode;

  function setBubbleMode(mode) {
    currentMode = mode;
    bubble.querySelectorAll("[data-mode]").forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.style.background   = active ? "#fde8e6" : "#fff";
      btn.style.color        = active ? "#c0394b" : "#5f6368";
      btn.style.fontWeight   = active ? "600"     : "normal";
    });
    timedDiv.style.display  = mode === "timed"  ? "block" : "none";
    alldayDiv.style.display = mode === "allday" ? "block" : "none";
    taskDiv.style.display   = mode === "task"   ? "block" : "none";
    confirmBtn.textContent  = mode === "task"   ? "Add to Google Tasks" : "Add to Calendar";

    if (mode === "task") {
      if (!taskDateInp.value) {
        taskDateInp.value = dtInput.value ? dtInput.value.slice(0, 10) : startInput.value;
      }
      if (!taskTimeInp.value && dtInput.value) {
        taskTimeInp.value = dtInput.value.slice(11, 16);
      }
    }
    if (mode === "allday" && dtInput.value) {
      const d = dtInput.value.slice(0, 10);
      if (!startInput.value) startInput.value = d;
      if (!endInput.value)   endInput.value   = d;
    }
  }

  bubble.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setBubbleMode(btn.dataset.mode));
  });

  startInput.addEventListener("change", () => {
    if (!endInput.value || endInput.value < startInput.value) {
      endInput.value = startInput.value;
    }
  });

  // ── Cancel ───────────────────────────────────────────────────────────────────
  bubble.querySelector("#sc-cancel").addEventListener("click", () => bubble.remove());

  // ── Confirm / create ─────────────────────────────────────────────────────────
  bubble.querySelector("#sc-confirm").addEventListener("click", () => {
    const title           = bubble.querySelector("#sc-title").value.trim();
    const descriptionHtml = getDescriptionHtml(descEl) || undefined;
    const descriptionText = getDescriptionValue(descEl) || undefined;
    const statusEl    = bubble.querySelector("#sc-status");
    const openBtnEl   = bubble.querySelector("#sc-open");
    const tz          = Intl.DateTimeFormat().resolvedOptions().timeZone;

    statusEl.style.color = "#5f6368";

    if (currentMode === "task") {
      const due = taskTimeInp.value
        ? new Date(`${taskDateInp.value}T${taskTimeInp.value}:00`).toISOString()
        : new Date(`${taskDateInp.value}T00:00:00`).toISOString();

      const task = {
        title,
        notes: descriptionText,
        due,
      };

      statusEl.textContent = "Creating task…";
      chrome.runtime.sendMessage({ type: "CREATE_TASK", task }, (res) => {
        if (res?.success) {
          statusEl.style.color = "#1e8e3e";
          statusEl.textContent = "✓ Task created!";
          const dismissTimer = setTimeout(() => bubble.remove(), 3000);
          openBtnEl.textContent = "Open Tasks ↗";
          openBtnEl.style.display = "";
          openBtnEl.addEventListener("click", () => {
            clearTimeout(dismissTimer);
            chrome.runtime.sendMessage({ type: "OPEN_URL", url: "https://calendar.google.com/calendar/r/tasks" });
            bubble.remove();
          });
        } else {
          statusEl.style.color = "#d93025";
          statusEl.textContent = "Error: " + (res?.error || "unknown");
        }
      });
      return;
    }

    // Calendar event (timed or all-day)
    let finalEvent;
    if (currentMode === "allday") {
      const startDate = startInput.value;
      const endDate   = addDays(endInput.value || startDate, 1);
      finalEvent = {
        ...event,
        summary: title,
        description: descriptionHtml,
        start: { date: startDate },
        end:   { date: endDate },
      };
    } else {
      const dt    = new Date(dtInput.value);
      const dur   = parseInt(bubble.querySelector("#sc-duration").value, 10) || 60;
      const endDt = new Date(dt.getTime() + dur * 60000);
      finalEvent = {
        ...event,
        summary: title,
        description: descriptionHtml,
        start: { dateTime: dt.toISOString(), timeZone: tz },
        end:   { dateTime: endDt.toISOString(), timeZone: tz },
      };
    }

    statusEl.textContent = "Creating event…";
    chrome.runtime.sendMessage({ type: "CREATE_EVENT", event: finalEvent }, (res) => {
      if (res?.success) {
        statusEl.style.color = "#1e8e3e";
        statusEl.textContent = "✓ Event created!";

        const dismissTimer = setTimeout(() => bubble.remove(), 3000);

        const htmlLink = res.result?.htmlLink;
        if (htmlLink) {
          openBtnEl.textContent = "Open in Calendar ↗";
          openBtnEl.style.display = "";
          openBtnEl.addEventListener("click", () => {
            clearTimeout(dismissTimer);
            chrome.runtime.sendMessage({ type: "OPEN_URL", url: htmlLink });
            bubble.remove();
          });
        }
      } else {
        statusEl.style.color = "#d93025";
        statusEl.textContent = "Error: " + (res?.error || "unknown");
      }
    });
  });

  return bubble;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns Notes as HTML for Google Calendar description (renders clickable links).
function getDescriptionHtml(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll("script, style, meta").forEach((n) => n.remove());
  return clone.innerHTML.trim();
}

// Returns Notes as plain text with links as "text (url)" for Google Tasks.
function getDescriptionValue(el) {
  const clone = el.cloneNode(true);
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

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSelectionAsText() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return "";
  return selection.getRangeAt(0).toString().trim();
}


// Adds `days` to a "YYYY-MM-DD" string, returns a new "YYYY-MM-DD" string.
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const result = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`;
}
