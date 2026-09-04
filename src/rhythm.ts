import type { Rhythm, ToolShare, UsageRecord } from './types.js';
import { localDay } from './stats.js';

const DAY_MS = 86_400_000;
/** A pause longer than this means you stopped, not that you paused. */
const IDLE_GAP_MS = 30 * 60_000;

function ratio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** Consecutive-day runs over a sorted, unique list of local day strings. */
function streaks(days: string[]): { longest: number; trailing: number } {
  if (days.length === 0) return { longest: 0, trailing: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Date.parse(days[i]!) - Date.parse(days[i - 1]!);
    run = gap === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { longest, trailing: run };
}

/**
 * Longest run of calls with no idle gap in it.
 *
 * Not the span of a session id: Claude Code resumes sessions, so one id can
 * span days of wall clock with a weekend in the middle. Records carry no
 * session anyway, so this measures work rather than bookkeeping.
 */
function longestStretch(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  let longest = 0;
  let start = sorted[0] ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! > IDLE_GAP_MS) start = sorted[i]!;
    else longest = Math.max(longest, sorted[i]! - start);
  }
  return longest;
}

/**
 * Streaks, working hours and weekend load — all derived from timestamps, which
 * every user has regardless of how they work.
 *
 * `now` is injected so the "is the streak still alive" rule is testable.
 */
export function computeRhythm(records: UsageRecord[], now: Date = new Date()): Rhythm {
  const hours = new Array<number>(24).fill(0);
  let weekendWritten = 0;
  let written = 0;
  const daySet = new Set<string>();
  const times: number[] = [];

  for (const r of records) {
    if (!r.ts) continue;
    const d = new Date(r.ts);
    if (Number.isNaN(d.getTime())) continue;
    hours[d.getHours()] = (hours[d.getHours()] ?? 0) + 1;
    written += r.output;
    const dow = d.getDay();
    if (dow === 0 || dow === 6) weekendWritten += r.output;
    times.push(d.getTime());
    daySet.add(localDay(r.ts));
  }

  const days = [...daySet].filter(Boolean).sort();
  const { longest, trailing } = streaks(days);

  // A streak is only "current" if it reaches today or yesterday; otherwise it is history.
  const today = localDay(now.toISOString());
  const last = days[days.length - 1] ?? '';
  const daysSince = last ? Math.round((Date.parse(today) - Date.parse(last)) / DAY_MS) : Infinity;
  const currentStreak = daysSince <= 1 ? trailing : 0;

  let peakHour = 0;
  for (let h = 1; h < 24; h++) if ((hours[h] ?? 0) > (hours[peakHour] ?? 0)) peakHour = h;

  const longestStretchMs = longestStretch(times);
  return { hours, peakHour, longestStretchMs, weekendShare: ratio(weekendWritten, written), currentStreak, longestStreak: longest };
}

export function toolShares(counts: Record<string, number>): ToolShare[] {
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  return Object.entries(counts)
    .map(([tool, calls]) => ({ tool, calls, share: ratio(calls, total) }))
    // Ties break by name, not by insertion order. Insertion order comes from
    // discover()'s readdir walk, so two people with identical usage could
    // otherwise see a different fourth tool depending on their filesystem.
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
}

export function sessionStats(sessionCalls: Record<string, number>): {
  count: number;
  median: number;
  largest: number;
} {
  const values = Object.values(sessionCalls).sort((a, b) => a - b);
  if (values.length === 0) return { count: 0, median: 0, largest: 0 };
  return {
    count: values.length,
    median: values[Math.floor(values.length / 2)]!,
    largest: values[values.length - 1]!,
  };
}
