// background.js — Service worker (runs in the background, no DOM access)
// Handles: context menu, auth token, Google Calendar API calls

// ─── Context Menu Setup ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "create-calendar-event",
    title: "Create Calendar event from selection",
    contexts: ["selection"],
  });
});

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CREATE_EVENT") {
    createCalendarEvent(message.event)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "PARSE_TEXT") {
    parseEventFromText(message.text)
      .then((parsed) => sendResponse({ success: true, parsed }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "OPEN_URL") {
    chrome.tabs.create({ url: message.url });
  }
});

// ─── Context Menu Click ───────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "create-calendar-event" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_EVENT_PREVIEW",
      text: info.selectionText,
      pageUrl: tab.url,
      pageTitle: tab.title,
    });
  }
});

// ─── Google Calendar API ──────────────────────────────────────────────────────

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function createCalendarEvent(event) {
  const token = await getAuthToken();

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Failed to create event");
  }

  return response.json();
}

// ─── AI Text Parsing ──────────────────────────────────────────────────────────
// TODO: Replace with a real AI call (Claude API, OpenAI, etc.)
// For now, this is a heuristic parser so you can test the full flow.

async function parseEventFromText(text) {
  const { date, hasTime } = extractDateInfo(text);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary = text.length > 60 ? text.slice(0, 57) + "…" : text;

  if (!hasTime) {
    // No time found → treat as all-day event.
    // Google Calendar end date is exclusive, so add 1 day.
    const startStr = toDateString(date);
    const nextDay  = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return {
      summary,
      start: { date: startStr },
      end:   { date: toDateString(nextDay) },
      description: `Created from: ${text}`,
      allDay: true,
    };
  }

  const endDate = new Date(date.getTime() + 60 * 60 * 1000);
  return {
    summary,
    start: { dateTime: date.toISOString(), timeZone: tz },
    end:   { dateTime: endDate.toISOString(), timeZone: tz },
    description: `Created from: ${text}`,
    allDay: false,
  };
}

// Returns { date: Date, hasTime: boolean }
function extractDateInfo(text) {
  const now   = new Date();
  const lower = text.toLowerCase();

  // ── Time extraction ──────────────────────────────────────────────────────
  let hour   = null;
  let minute = 0;

  const ampmMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const h24Match  = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (ampmMatch) {
    hour   = parseInt(ampmMatch[1]);
    minute = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0;
    if (ampmMatch[3] === "pm" && hour < 12) hour += 12;
    if (ampmMatch[3] === "am" && hour === 12) hour = 0;
  } else if (h24Match) {
    hour   = parseInt(h24Match[1]);
    minute = parseInt(h24Match[2]);
  }

  const hasTime = hour !== null;

  // ── Date extraction ──────────────────────────────────────────────────────
  let date = null;

  if (lower.includes("today")) {
    date = new Date(now);
  } else if (lower.includes("tomorrow")) {
    date = new Date(now);
    date.setDate(now.getDate() + 1);
  }

  // Named weekday: "Monday", "next Tuesday"
  if (!date) {
    const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const dayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dayMatch) {
      const target  = DAYS.indexOf(dayMatch[2]);
      let daysAhead = target - now.getDay();
      if (daysAhead <= 0 || dayMatch[1]) daysAhead += 7;
      date = new Date(now);
      date.setDate(now.getDate() + daysAhead);
    }
  }

  // Month-name date: "June 15", "Jun 15", "Oct 1, 2026", "October 1 2026"
  if (!date) {
    const MONTHS = ["january","february","march","april","may","june",
                    "july","august","september","october","november","december"];
    const mMatch = lower.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/
    );
    if (mMatch) {
      const abbr = mMatch[1];
      const m    = MONTHS.findIndex(name => name.startsWith(abbr));
      const d    = parseInt(mMatch[2]);
      const y    = mMatch[3] ? parseInt(mMatch[3]) : now.getFullYear();
      date = new Date(y, m, d);
      if (!mMatch[3] && date < now) date.setFullYear(now.getFullYear() + 1);
    }
  }

  // Numeric date: MM/DD or MM/DD/YYYY
  if (!date) {
    const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1]) - 1;
      const d = parseInt(slashMatch[2]);
      const y = slashMatch[3]
        ? (slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3]) : parseInt(slashMatch[3]))
        : now.getFullYear();
      date = new Date(y, m, d);
      if (!slashMatch[3] && date < now) date.setFullYear(now.getFullYear() + 1);
    }
  }

  // ISO date: YYYY-MM-DD (checked before dash format to avoid ambiguity)
  if (!date) {
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }
  }

  // Dash date: MM-DD-YY or MM-DD-YYYY (e.g. "06-18-26" or "06-18-2026")
  if (!date) {
    const dashMatch = text.match(/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/);
    if (dashMatch) {
      const m = parseInt(dashMatch[1]) - 1;
      const d = parseInt(dashMatch[2]);
      const y = dashMatch[3].length <= 2 ? 2000 + parseInt(dashMatch[3]) : parseInt(dashMatch[3]);
      if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
        date = new Date(y, m, d);
      }
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  if (!date) {
    date = new Date(now);
    date.setDate(now.getDate() + 1);
  }

  date.setHours(hasTime ? hour : 0, hasTime ? minute : 0, 0, 0);
  return { date, hasTime };
}

function toDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
