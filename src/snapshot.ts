import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { snapshotDir } from './paths.js';
import type { Delta, Rhythm, Signals, Snapshot, Stats } from './types.js';
import { sessionStats, toolShares } from './rhythm.js';
import { localDay } from './stats.js';

export { snapshotDir };

export function buildSnapshot(
  stats: Stats,
  rhythm: Rhythm,
  signals: Signals,
  takenAt: string,
): Snapshot {
  const tools = toolShares(signals.toolCounts);
  return {
    version: 1,
    takenAt,
    firstDay: stats.firstDay,
    lastDay: stats.lastDay,
    activeDays: stats.activeDays,
    calls: stats.calls,
    written: stats.written,
    readWriteRatio: stats.readWriteRatio,
    cacheShare: stats.cacheShare,
    subagentCallShare: stats.subagentCallShare,
    currentStreak: rhythm.currentStreak,
    longestStreak: rhythm.longestStreak,
    weekendShare: rhythm.weekendShare,
    peakHour: rhythm.peakHour,
    humanTurns: signals.userMessages,
    limitEvents: signals.limitEvents.length,
    overloads: signals.overloads,
    sessions: sessionStats(signals.sessionCalls).count,
    topSkill: stats.topSkills[0]?.skill ?? null,
    topModel: stats.models[0]?.model ?? null,
    longestStretchMs: rhythm.longestStretchMs,
    topTool: tools[0]?.tool ?? null,
    toolCounts: signals.toolCounts,
  };
}

/** Most recent snapshot taken strictly before `today`. */
export async function loadPrevious(dir: string, today: string): Promise<Snapshot | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const candidates = names
    .filter((n) => n.endsWith('.json') && n.slice(0, 10) < today)
    .sort();
  for (const name of candidates.reverse()) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (parsed?.version === 1) return parsed as Snapshot;
    } catch {
      // a corrupt snapshot is skipped, not fatal
    }
  }
  return null;
}

/** Re-running on the same day overwrites rather than accumulating duplicates. */
export async function saveSnapshot(dir: string, snapshot: Snapshot): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${snapshot.takenAt}.json`);
  await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf8');
  return path;
}

/**
 * Days of history lost between two runs.
 *
 * Retention deletes transcripts while you are away, so running less often than
 * your retention window leaves a hole that no later run can recover.
 */
export function computeDelta(previous: Snapshot, stats: Stats): Delta {
  const gapMs = Date.parse(stats.firstDay) - Date.parse(previous.lastDay);
  const gapDays = Number.isFinite(gapMs) ? Math.max(0, Math.round(gapMs / 86_400_000) - 1) : 0;
  return { previous, gapDays };
}

export function todayStamp(now: Date = new Date()): string {
  return localDay(now.toISOString());
}
