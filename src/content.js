// content.js — Injected into every webpage
// Handles: showing the event preview bubble after right-click → "Create Calendar event"

let previewBubble = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SHOW_EVENT_PREVIEW") {
    showPreviewBubble(message.text, message.pageUrl, message.pageTitle);
  }
});

function showPreviewBubble(text, pageUrl, pageTitle) {
  if (previewBubble) previewBubble.remove();

  chrome.runtime.sendMessage({ type: "PARSE_TEXT", text }, (response) => {
    if (!response?.success) {
      alert("Couldn't parse event: " + (response?.error || "unknown error"));
      return;
    }

    const event = response.parsed;
    event.source = { title: pageTitle, url: pageUrl };

    previewBubble = createBubble(event);
    document.body.appendChild(previewBubble);
  });
}

function createBubble(event) {
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

  bubble.innerHTML = `
    <div style="font-weight:600;font-size:15px;margin-bottom:10px">📅 New Calendar Event</div>

    <label style="display:block;margin-bottom:4px;font-size:12px;color:#5f6368">Title</label>
    <input id="sc-title" value="${escHtml(event.summary)}"
      style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #dadce0;border-radius:6px;font-size:14px;margin-bottom:10px">

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <input id="sc-allday" type="checkbox" ${isAllDay ? "checked" : ""} style="cursor:pointer;margin:0">
      <label for="sc-allday" style="font-size:13px;color:#202124;cursor:pointer;margin:0">All-day event</label>
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

  // ── Wire up all-day toggle ───────────────────────────────────────────────────
  const alldayEl   = bubble.querySelector("#sc-allday");
  const timedDiv   = bubble.querySelector("#sc-timed");
  const alldayDiv  = bubble.querySelector("#sc-allday-fields");
  const dtInput    = bubble.querySelector("#sc-datetime");
  const startInput = bubble.querySelector("#sc-startdate");
  const endInput   = bubble.querySelector("#sc-enddate");

  alldayEl.addEventListener("change", () => {
    const allDay = alldayEl.checked;
    timedDiv.style.display  = allDay ? "none" : "block";
    alldayDiv.style.display = allDay ? "block" : "none";
    if (allDay && dtInput.value) {
      const d = dtInput.value.slice(0, 10);
      startInput.value = d;
      endInput.value   = d;
    }
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
    const title    = bubble.querySelector("#sc-title").value.trim();
    const allDay   = alldayEl.checked;
    const statusEl = bubble.querySelector("#sc-status");
    const openBtnEl = bubble.querySelector("#sc-open");
    const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;

    let finalEvent;

    if (allDay) {
      const startDate = startInput.value;
      const endDate   = addDays(endInput.value || startDate, 1);
      finalEvent = {
        ...event,
        summary: title,
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
        start: { dateTime: dt.toISOString(), timeZone: tz },
        end:   { dateTime: endDt.toISOString(), timeZone: tz },
      };
    }

    statusEl.textContent = "Creating event…";
    statusEl.style.color = "#5f6368";

    chrome.runtime.sendMessage({ type: "CREATE_EVENT", event: finalEvent }, (res) => {
      if (res?.success) {
        statusEl.style.color = "#1e8e3e";
        statusEl.textContent = "✓ Event created!";

        const dismissTimer = setTimeout(() => bubble.remove(), 3000);

        const htmlLink = res.result?.htmlLink;
        if (htmlLink) {
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

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Adds `days` to a "YYYY-MM-DD" string, returns a new "YYYY-MM-DD" string.
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const result = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`;
}
