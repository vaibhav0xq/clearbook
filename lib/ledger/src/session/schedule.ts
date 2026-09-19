import feedsSnapshot from "../registry/pyth-feeds.json";

/**
 * Pyth publishes trading schedules as strings of the form
 * "America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;1127/0930-1300,1225/C"
 * (timezone; seven weekday ranges Monday first; holiday overrides MMDD/range).
 * A day may hold several ranges joined by "&" and "O" means open all day.
 */

export type SessionState =
  | "regular"
  | "pre_market"
  | "post_market"
  | "overnight"
  | "closed"
  | "continuous"
  | "unknown";

export interface SessionSchedules {
  regular: string;
  pre_market?: string;
  post_market?: string;
  over_night?: string;
}

export interface SessionInfo {
  state: SessionState;
  label: string;
  venue: string;
  timezone: string;
  nextChangeAt: Date | null;
  nextState: string | null;
}

interface FeedsSnapshot {
  generatedAt: string;
  schedules: Record<string, { schedule: string; sessions: SessionSchedules | null }>;
  feeds: Record<string, { id: number; assetType: string; schedule: string; exponent?: number; hermesId?: string }>;
}

const feeds = feedsSnapshot as FeedsSnapshot;

export interface PythFeedInfo {
  id: number;
  assetType: string;
  exponent: number | null;
  hermesId: string | null;
  sessions: SessionSchedules;
}

export function getPythFeed(symbol: string): PythFeedInfo | null {
  const feed = feeds.feeds[symbol];
  if (!feed) return null;
  const sched = feeds.schedules[feed.schedule];
  if (!sched) return null;
  const sessions = sched.sessions ?? { regular: sched.schedule };
  return { id: feed.id, assetType: feed.assetType, exponent: feed.exponent ?? null, hermesId: feed.hermesId ?? null, sessions };
}

export const US_EQUITY_SESSIONS: SessionSchedules = getPythFeed("Equity.US.AAPL/USD")?.sessions ?? {
  regular: "America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C",
  pre_market: "America/New_York;0400-0930,0400-0930,0400-0930,0400-0930,0400-0930,C,C",
  post_market: "America/New_York;1600-2000,1600-2000,1600-2000,1600-2000,1600-2000,C,C",
  over_night:
    "America/New_York;0000-0400&2000-2400,0000-0400&2000-2400,0000-0400&2000-2400,0000-0400&2000-2400,0000-0400,C,2000-2400",
};

interface LocalTime {
  weekday: number; // 0 Monday .. 6 Sunday
  mmdd: string;
  minutes: number; // minutes since local midnight
  dateKey: string; // YYYY-MM-DD local
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function localTime(at: Date, timeZone: string): LocalTime {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    weekday,
    mmdd: `${get("month")}${get("day")}`,
    minutes: hour * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

interface Range {
  start: number;
  end: number;
}

function parseRanges(spec: string): Range[] {
  if (spec === "C") return [];
  if (spec === "O") return [{ start: 0, end: 1440 }];
  return spec.split("&").map((r) => {
    const [s, e] = r.split("-");
    const start = Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
    const end = Number(e.slice(0, 2)) * 60 + Number(e.slice(2, 4));
    return { start, end };
  });
}

interface ParsedSchedule {
  timezone: string;
  weekdays: Range[][];
  holidays: Map<string, Range[]>;
}

const parsedCache = new Map<string, ParsedSchedule>();

export function parseSchedule(schedule: string): ParsedSchedule {
  const cached = parsedCache.get(schedule);
  if (cached) return cached;
  const [timezone, days, holidays] = schedule.split(";");
  const weekdays = (days ?? "").split(",").map(parseRanges);
  while (weekdays.length < 7) weekdays.push([]);
  const holidayMap = new Map<string, Range[]>();
  if (holidays) {
    for (const h of holidays.split(",")) {
      const [mmdd, spec] = h.split("/");
      if (mmdd && spec) holidayMap.set(mmdd, parseRanges(spec));
    }
  }
  const parsed = { timezone: timezone ?? "UTC", weekdays, holidays: holidayMap };
  parsedCache.set(schedule, parsed);
  return parsed;
}

function rangesFor(parsed: ParsedSchedule, lt: LocalTime): Range[] {
  const override = parsed.holidays.get(lt.mmdd);
  if (override) return override;
  return parsed.weekdays[lt.weekday] ?? [];
}

export function isOpen(schedule: string, at: Date): boolean {
  const parsed = parseSchedule(schedule);
  const lt = localTime(at, parsed.timezone);
  return rangesFor(parsed, lt).some((r) => lt.minutes >= r.start && lt.minutes < r.end);
}

function localFields(at: Date, timeZone: string): { y: number; m: number; d: number; minutes: number } {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), minutes: (get("hour") % 24) * 60 + get("minute") };
}

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const f = localFields(at, timeZone);
  const asUtc = Date.UTC(f.y, f.m - 1, f.d, 0, f.minutes);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Converts a local calendar day plus minutes since midnight into an instant. */
function localToUtc(y: number, m: number, d: number, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let offset = tzOffsetMinutes(new Date(guess), timeZone);
  let result = guess - offset * 60_000;
  const check = tzOffsetMinutes(new Date(result), timeZone);
  if (check !== offset) {
    offset = check;
    result = guess - offset * 60_000;
  }
  return new Date(result);
}

/** All open and close instants of a schedule within the next `days` local days. */
function boundaries(schedule: string, at: Date, days: number): Date[] {
  const parsed = parseSchedule(schedule);
  const out: Date[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= days; i++) {
    const probe = new Date(at.getTime() + i * 86_400_000);
    const lt = localTime(probe, parsed.timezone);
    if (seen.has(lt.dateKey)) continue;
    seen.add(lt.dateKey);
    const [y, m, d] = lt.dateKey.split("-").map(Number);
    for (const r of rangesFor(parsed, lt)) {
      out.push(localToUtc(y, m, d, r.start, parsed.timezone));
      out.push(localToUtc(y, m, d, r.end, parsed.timezone));
    }
  }
  return out;
}

const SESSION_LABELS: Record<SessionState, string> = {
  regular: "Regular session",
  pre_market: "Pre market",
  post_market: "After hours",
  overnight: "Overnight session",
  closed: "Market closed",
  continuous: "Trades around the clock",
  unknown: "Session unknown",
};

export function sessionLabel(state: SessionState): string {
  return SESSION_LABELS[state];
}

function resolveState(sessions: SessionSchedules, at: Date): SessionState {
  const ordered: Array<[SessionState, string | undefined]> = [
    ["regular", sessions.regular],
    ["pre_market", sessions.pre_market],
    ["post_market", sessions.post_market],
    ["overnight", sessions.over_night],
  ];
  for (const [candidate, schedule] of ordered) {
    if (schedule && isOpen(schedule, at)) return candidate;
  }
  return "closed";
}

/**
 * Determines the session state of a reference market at a given instant and
 * the next state change. Regular takes precedence over extended sessions.
 */
export function sessionAt(sessions: SessionSchedules, at: Date, venue: string): SessionInfo {
  const timezone = parseSchedule(sessions.regular).timezone;
  const state = resolveState(sessions, at);
  const candidates: Date[] = [];
  for (const schedule of [sessions.regular, sessions.pre_market, sessions.post_market, sessions.over_night]) {
    if (schedule) candidates.push(...boundaries(schedule, at, 8));
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  let nextChangeAt: Date | null = null;
  let nextState: string | null = null;
  for (const t of candidates) {
    if (t.getTime() <= at.getTime()) continue;
    const s = resolveState(sessions, t);
    if (s !== state) {
      nextChangeAt = t;
      nextState = s;
      break;
    }
  }
  return {
    state,
    label: SESSION_LABELS[state],
    venue,
    timezone,
    nextChangeAt,
    nextState,
  };
}

export function continuousSession(venue: string): SessionInfo {
  return {
    state: "continuous",
    label: SESSION_LABELS.continuous,
    venue,
    timezone: "UTC",
    nextChangeAt: null,
    nextState: null,
  };
}

export function unknownSession(venue: string): SessionInfo {
  return {
    state: "unknown",
    label: SESSION_LABELS.unknown,
    venue,
    timezone: "UTC",
    nextChangeAt: null,
    nextState: null,
  };
}

/** Human venue name for an ISO 10383 MIC code. */
export function venueName(mic: string | null): string {
  switch (mic) {
    case "XNAS":
      return "Nasdaq";
    case "XNYS":
      return "NYSE";
    case "ARCX":
      return "NYSE Arca";
    case "XASE":
      return "NYSE American";
    case "BATS":
      return "Cboe BZX";
    case "XLON":
      return "London Stock Exchange";
    case "XETR":
      return "Xetra";
    case "XHKG":
      return "Hong Kong Exchange";
    case "XMAD":
      return "Bolsa de Madrid";
    default:
      return "US equities";
  }
}
