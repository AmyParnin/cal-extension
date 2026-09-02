// Mock the Chrome extension APIs so background.js can be required in Node
global.chrome = {
  runtime:      { onInstalled: { addListener: () => {} }, onMessage: { addListener: () => {} } },
  contextMenus: { create: () => {},                       onClicked:  { addListener: () => {} } },
  tabs:         { sendMessage: () => {},                  create:     () => {} },
  identity:     { getAuthToken: () => {} },
  storage:      { local: { get: () => Promise.resolve({}), set: () => Promise.resolve(), remove: () => Promise.resolve() } },
};

const { extractDateInfo, heuristicTitle, parseEventFromText } = require("../src/background.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function ymd(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hhmm(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Returns the date string for "today + N days"
function relativeDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

// Returns the date string for the next occurrence of a given weekday (0=Sun … 6=Sat)
function nextWeekday(targetDay) {
  const now = new Date();
  let daysAhead = targetDay - now.getDay();
  if (daysAhead <= 0) daysAhead += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + daysAhead);
  return ymd(d);
}

// ── Absolute dates (year explicitly stated — results don't depend on today) ──

describe("Absolute dates with explicit year", () => {
  test("flight itinerary: Thu, Oct 1, 2026 10:45 PM", () => {
    const { date, hasTime } = extractDateInfo("Arrive\n\nThu, Oct 1, 2026\n\n10:45 PM");
    expect(ymd(date)).toBe("2026-10-01");
    expect(hhmm(date)).toBe("22:45");
    expect(hasTime).toBe(true);
  });

  test("school calendar: Sept 15, 2026 (no time → all-day)", () => {
    const { date, hasTime } = extractDateInfo("Sept 15, 2026: Parent Chaperone Interest Form Deadline");
    expect(ymd(date)).toBe("2026-09-15");
    expect(hasTime).toBe(false);
  });

  test("period after abbreviation: Sept. 15, 2026", () => {
    const { date, hasTime } = extractDateInfo("Sept. 15, 2026: Staff meeting");
    expect(ymd(date)).toBe("2026-09-15");
    expect(hasTime).toBe(false);
  });

  test("full weekday + full month: Thursday, October 1, 2026 at 2pm", () => {
    const { date, hasTime } = extractDateInfo("Thursday, October 1, 2026 at 2pm");
    expect(ymd(date)).toBe("2026-10-01");
    expect(hhmm(date)).toBe("14:00");
    expect(hasTime).toBe(true);
  });

  test("ordinal day: January 1st, 2027 — New Year's Day", () => {
    const { date, hasTime } = extractDateInfo("January 1st, 2027 — New Year's Day");
    expect(ymd(date)).toBe("2027-01-01");
    expect(hasTime).toBe(false);
  });

  test("numeric MM/DD/YYYY: 12/25/2026", () => {
    const { date, hasTime } = extractDateInfo("Holiday party 12/25/2026");
    expect(ymd(date)).toBe("2026-12-25");
    expect(hasTime).toBe(false);
  });

  test("ISO format: 2026-12-25", () => {
    const { date, hasTime } = extractDateInfo("OOO: 2026-12-25");
    expect(ymd(date)).toBe("2026-12-25");
    expect(hasTime).toBe(false);
  });

  test("ISO with time: 2026-12-25 at 9:00", () => {
    const { date, hasTime } = extractDateInfo("Standup 2026-12-25 at 9:00");
    expect(ymd(date)).toBe("2026-12-25");
    expect(hhmm(date)).toBe("09:00");
    expect(hasTime).toBe(true);
  });

  test("dash format: 06-18-2026", () => {
    const { date, hasTime } = extractDateInfo("Dentist appointment 06-18-2026");
    expect(ymd(date)).toBe("2026-06-18");
    expect(hasTime).toBe(false);
  });

  test("short year: 06-18-26", () => {
    const { date, hasTime } = extractDateInfo("Dentist appointment 06-18-26");
    expect(ymd(date)).toBe("2026-06-18");
    expect(hasTime).toBe(false);
  });

  test("time with seconds ignored: Mar. 3, 2027 at 10:30 AM", () => {
    const { date, hasTime } = extractDateInfo("Doctor Mar. 3, 2027 at 10:30 AM");
    expect(ymd(date)).toBe("2027-03-03");
    expect(hhmm(date)).toBe("10:30");
    expect(hasTime).toBe(true);
  });

  test("all abbreviated months parse correctly", () => {
    const cases = [
      ["Jan 5, 2027",  "2027-01-05"],
      ["Feb 14, 2027", "2027-02-14"],
      ["Mar 1, 2027",  "2027-03-01"],
      ["Apr 10, 2027", "2027-04-10"],
      ["May 20, 2027", "2027-05-20"],
      ["Jun 15, 2027", "2027-06-15"],
      ["Jul 4, 2027",  "2027-07-04"],
      ["Aug 31, 2027", "2027-08-31"],
      ["Sep 1, 2027",  "2027-09-01"],
      ["Sept 2, 2027", "2027-09-02"],
      ["Oct 31, 2027", "2027-10-31"],
      ["Nov 11, 2027", "2027-11-11"],
      ["Dec 25, 2027", "2027-12-25"],
    ];
    for (const [input, expected] of cases) {
      const { date } = extractDateInfo(input);
      expect(ymd(date)).toBe(expected);
    }
  });
});

// ── Time parsing ──────────────────────────────────────────────────────────────

describe("Time parsing", () => {
  test("noon is treated as 12:00", () => {
    const { date, hasTime } = extractDateInfo("Lunch Oct 5, 2026 at noon");
    expect(hhmm(date)).toBe("12:00");
    expect(hasTime).toBe(true);
  });

  test("midnight is treated as 00:00", () => {
    const { date, hasTime } = extractDateInfo("Midnight release Oct 5, 2026 at midnight");
    expect(hhmm(date)).toBe("00:00");
    expect(hasTime).toBe(true);
  });

  test("12-hour AM: 9am", () => {
    const { date } = extractDateInfo("Standup Oct 5, 2026 9am");
    expect(hhmm(date)).toBe("09:00");
  });

  test("12-hour PM: 3:30pm", () => {
    const { date } = extractDateInfo("Call Oct 5, 2026 3:30pm");
    expect(hhmm(date)).toBe("15:30");
  });

  test("12:00 PM is noon, not midnight", () => {
    const { date } = extractDateInfo("Lunch Oct 5, 2026 12:00 PM");
    expect(hhmm(date)).toBe("12:00");
  });

  test("12:00 AM is midnight", () => {
    const { date } = extractDateInfo("Flight Oct 5, 2026 12:00 AM");
    expect(hhmm(date)).toBe("00:00");
  });

  test("24-hour time: 15:00", () => {
    const { date } = extractDateInfo("Meeting Oct 5, 2026 15:00");
    expect(hhmm(date)).toBe("15:00");
  });

  test("no time → hasTime is false", () => {
    const { hasTime } = extractDateInfo("Oct 5, 2026");
    expect(hasTime).toBe(false);
  });
});

// ── Relative dates ────────────────────────────────────────────────────────────

describe("Relative dates", () => {
  test("today at 5pm", () => {
    const { date, hasTime } = extractDateInfo("Reminder today at 5pm");
    expect(ymd(date)).toBe(relativeDate(0));
    expect(hhmm(date)).toBe("17:00");
    expect(hasTime).toBe(true);
  });

  test("tomorrow at 9am", () => {
    const { date, hasTime } = extractDateInfo("Doctor appointment tomorrow at 9am");
    expect(ymd(date)).toBe(relativeDate(1));
    expect(hhmm(date)).toBe("09:00");
    expect(hasTime).toBe(true);
  });

  test("tomorrow with no time → all-day", () => {
    const { date, hasTime } = extractDateInfo("Submit report tomorrow");
    expect(ymd(date)).toBe(relativeDate(1));
    expect(hasTime).toBe(false);
  });

  test("full weekday: Monday at 3pm", () => {
    const { date, hasTime } = extractDateInfo("Team sync Monday at 3pm");
    expect(ymd(date)).toBe(nextWeekday(1));
    expect(hhmm(date)).toBe("15:00");
    expect(hasTime).toBe(true);
  });

  test("abbreviated weekday: Mon at noon", () => {
    const { date, hasTime } = extractDateInfo("Lunch Mon at noon");
    expect(ymd(date)).toBe(nextWeekday(1));
    expect(hhmm(date)).toBe("12:00");
    expect(hasTime).toBe(true);
  });

  test("abbreviated weekday: Fri at 8pm", () => {
    const { date } = extractDateInfo("Dinner Fri at 8pm");
    expect(ymd(date)).toBe(nextWeekday(5));
    expect(hhmm(date)).toBe("20:00");
  });

  test("abbreviated weekday: Sat at 10am", () => {
    const { date } = extractDateInfo("Yoga class Sat at 10am");
    expect(ymd(date)).toBe(nextWeekday(6));
  });

  test("next Tuesday at 10:30am", () => {
    const { date, hasTime } = extractDateInfo("Dentist next Tuesday at 10:30am");
    // Parser logic: daysAhead = (target - today) + 7 when "next" prefix present,
    // because the "next" capture group is truthy so the || condition always fires once.
    const now = new Date();
    const daysAhead = (2 - now.getDay()) + 7;
    const expected = new Date(now);
    expected.setDate(now.getDate() + daysAhead);
    expect(ymd(date)).toBe(ymd(expected));
    expect(hhmm(date)).toBe("10:30");
    expect(hasTime).toBe(true);
  });

  test("all abbreviated weekdays are recognised", () => {
    const days = [
      ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3],
      ["Thu", 4], ["Fri", 5], ["Sat", 6],
    ];
    for (const [abbr, dayNum] of days) {
      const { date } = extractDateInfo(`Meeting ${abbr} at 9am`);
      expect(ymd(date)).toBe(nextWeekday(dayNum));
    }
  });
});

// ── Realistic real-world snippets ─────────────────────────────────────────────

describe("Real-world text snippets", () => {
  test("airline confirmation: Thu, Oct 1, 2026 – 10:45 PM arrival", () => {
    const text = "Arrive\n\nThu, Oct 1, 2026\n\n10:45 PM\nSFO – San Francisco Intl";
    const { date, hasTime } = extractDateInfo(text);
    expect(ymd(date)).toBe("2026-10-01");
    expect(hhmm(date)).toBe("22:45");
    expect(hasTime).toBe(true);
  });

  test("school newsletter deadline", () => {
    const text = "Sept 15, 2026: Parent Chaperone Interest Form & MyVolunteer Clearance Deadline.";
    const { date, hasTime } = extractDateInfo(text);
    expect(ymd(date)).toBe("2026-09-15");
    expect(hasTime).toBe(false);
  });

  test("calendar invite with weekday prefix: Fri, Jan 2, 2026 at 3:30 PM", () => {
    const { date, hasTime } = extractDateInfo("Team offsite Fri, Jan 2, 2026 at 3:30 PM");
    expect(ymd(date)).toBe("2026-01-02");
    expect(hhmm(date)).toBe("15:30");
    expect(hasTime).toBe(true);
  });

  test("holiday: Friday, December 25, 2026", () => {
    const { date, hasTime } = extractDateInfo("Office closed – Friday, December 25, 2026");
    expect(ymd(date)).toBe("2026-12-25");
    expect(hasTime).toBe(false);
  });

  test("event flyer: Saturday Nov 7th, 2026 at 7pm", () => {
    const { date, hasTime } = extractDateInfo("Fall Gala – Saturday Nov 7th, 2026 at 7pm. Doors open at 6:30.");
    expect(ymd(date)).toBe("2026-11-07");
    expect(hhmm(date)).toBe("19:00");
    expect(hasTime).toBe(true);
  });

  test("doctor reminder: Tue, Aug. 4, 2026 9:00 AM", () => {
    const { date, hasTime } = extractDateInfo("Your appointment is confirmed: Tue, Aug. 4, 2026 9:00 AM");
    expect(ymd(date)).toBe("2026-08-04");
    expect(hhmm(date)).toBe("09:00");
    expect(hasTime).toBe(true);
  });

  test("sports schedule: Wed 10/14/2026 7:30 PM", () => {
    const { date, hasTime } = extractDateInfo("Game night Wed 10/14/2026 7:30 PM at the arena");
    expect(ymd(date)).toBe("2026-10-14");
    expect(hhmm(date)).toBe("19:30");
    expect(hasTime).toBe(true);
  });

  test("hotel checkout: March 22nd, 2027", () => {
    const { date, hasTime } = extractDateInfo("Checkout: March 22nd, 2027");
    expect(ymd(date)).toBe("2027-03-22");
    expect(hasTime).toBe(false);
  });

  test("standup reminder: every Monday at 9:00 AM", () => {
    const { date, hasTime } = extractDateInfo("Team standup every Monday at 9:00 AM");
    expect(ymd(date)).toBe(nextWeekday(1));
    expect(hhmm(date)).toBe("09:00");
    expect(hasTime).toBe(true);
  });
});

// ── Fallback behaviour ────────────────────────────────────────────────────────

describe("Fallback behaviour", () => {
  test("no date or time → tomorrow, all-day", () => {
    const { date, hasTime } = extractDateInfo("Pick up dry cleaning");
    expect(ymd(date)).toBe(relativeDate(1));
    expect(hasTime).toBe(false);
  });

  test("time only, no date → tomorrow at that time", () => {
    const { date, hasTime } = extractDateInfo("Call at 3pm");
    expect(ymd(date)).toBe(relativeDate(1));
    expect(hhmm(date)).toBe("15:00");
    expect(hasTime).toBe(true);
  });
});

// ── Heuristic title (no-API-key fallback) ─────────────────────────────────────
// These cover the title generation used in all 3 modes × 2 surfaces.

describe("heuristicTitle — timed event text", () => {
  test("strips date, time in parens, and via-platform suffix", () => {
    expect(heuristicTitle("Sept 3, 2026 (5:30 PM): Virtual Parent Info Meeting via Google Meet."))
      .toBe("Virtual Parent Info Meeting");
  });

  test("strips time-only prefix from flight itinerary", () => {
    expect(heuristicTitle("Thu, Oct 1, 2026 10:45 PM — SFO Arrival"))
      .toBe("SFO Arrival");
  });

  test("strips leading date and colon, keeps title", () => {
    expect(heuristicTitle("Friday, December 25, 2026: Christmas Day Lunch"))
      .toBe("Christmas Day Lunch");
  });

  test("strips 'via Zoom' (one-word platform)", () => {
    expect(heuristicTitle("Team Standup Monday at 9am via Zoom"))
      .toBe("Team Standup");
  });

  test("strips 'via Microsoft Teams' (two-word platform)", () => {
    expect(heuristicTitle("Sprint Review Friday at 2pm via Microsoft Teams"))
      .toBe("Sprint Review");
  });
});

describe("heuristicTitle — all-day event text", () => {
  test("school newsletter deadline", () => {
    expect(heuristicTitle("Sept 15, 2026: Parent Chaperone Interest Form & MyVolunteer Clearance Deadline."))
      .toBe("Parent Chaperone Interest Form & MyVolunteer Clearance Deadline");
  });

  test("holiday with full date prefix", () => {
    expect(heuristicTitle("Monday, January 1st, 2027 — New Year's Day"))
      .toBe("New Year's Day");
  });

  test("ISO date prefix stripped", () => {
    expect(heuristicTitle("2026-12-25 Christmas Holiday"))
      .toBe("Christmas Holiday");
  });
});

describe("heuristicTitle — task-style text", () => {
  test("deadline sentence", () => {
    expect(heuristicTitle("Submit expense report by Friday"))
      .toBe("Submit expense report");
  });

  test("reminder with tomorrow", () => {
    expect(heuristicTitle("Call dentist tomorrow"))
      .toBe("Call dentist");
  });

  test("plain title with no date at all is returned unchanged", () => {
    expect(heuristicTitle("Team offsite planning"))
      .toBe("Team offsite planning");
  });
});

describe("parseEventFromText — structure for all modes (no API key)", () => {
  test("timed event returns allDay:false with dateTime fields", async () => {
    const result = await parseEventFromText("Team standup Monday at 9am");
    expect(result.allDay).toBe(false);
    expect(result.start.dateTime).toBeDefined();
    expect(result.end.dateTime).toBeDefined();
    expect(result.summary).toBeTruthy();
  });

  test("all-day event returns allDay:true with date fields", async () => {
    const result = await parseEventFromText("Sept 15, 2026: School picnic");
    expect(result.allDay).toBe(true);
    expect(result.start.date).toBe("2026-09-15");
    expect(result.end.date).toBe("2026-09-16"); // exclusive end
    expect(result.summary).toBeTruthy();
  });

  test("task text still parses to a valid event structure (task logic is in popup/content)", async () => {
    const result = await parseEventFromText("Submit report by Friday at noon");
    expect(result.summary).toBeTruthy();
    expect(result.start).toBeDefined();
    expect(result.end).toBeDefined();
  });
});
