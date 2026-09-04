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

/**
 * Snapshots are named YYYY-MM-DD.<source>.json.
 *
 * A bare YYYY-MM-DD.json predates multi-source support and can only have come
 * from Claude Code, so it is read as such rather than migrated — rewriting
 * someone's stored history to add a word to a filename buys nothing.
 *
 * Namespacing by filename also closes the cross-source delta hazard by
 * construction: computeDelta cannot compare Codex against Claude Code, because
 * loadPrevious never opens the other source's file.
 */
const DAY = /^(\d{4}-\d{2}-\d{2})/;

function belongsTo(name: string, sourceId: string): boolean {
  if (!name.endsWith('.json')) return false;
  const rest = name.replace(DAY, '').replace(/\.json$/, '');
  if (rest === `.${sourceId}`) return true;
  return rest === '' && sourceId === 'claude-code';
}

/**
 * Newest date first; a plain string sort is only chronologically correct when
 * two filenames' date prefixes differ. When a bare and a namespaced file share
 * the same date, string order puts the bare name after the namespaced one
 * ("2026-09-03.claude-code.json" < "2026-09-03.json", since 'c' < 'j'), which
 * would silently surface the stale pre-upgrade bare file as "most recent".
 *
 * A bare filename can only predate multi-source support (see belongsTo), so
 * on any given day the namespaced file for that day was necessarily written
 * later — it must win the tie.
 */
function byNewest(a: string, b: string): number {
  const dateA = a.slice(0, 10);
  const dateB = b.slice(0, 10);
  if (dateA !== dateB) return dateA < dateB ? 1 : -1;
  const bareA = a.slice(10) === '.json';
  const bareB = b.slice(10) === '.json';
  if (bareA === bareB) return 0;
  return bareA ? 1 : -1;
}

/** Most recent snapshot for one source, taken strictly before `today`. */
export async function loadPrevious(
  dir: string,
  today: string,
  sourceId: string,
): Promise<Snapshot | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const candidates = names
    .filter((n) => DAY.test(n) && n.slice(0, 10) < today && belongsTo(n, sourceId))
    .sort(byNewest);
  for (const name of candidates) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (parsed?.version === 1) return parsed as Snapshot;
    } catch {
      // a corrupt snapshot is skipped, not fatal
    }
  }
  return null;
}

/** Re-running on the same day for the same source overwrites rather than accumulating. */
export async function saveSnapshot(
  dir: string,
  snapshot: Snapshot,
  sourceId: string,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${snapshot.takenAt}.${sourceId}.json`);
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
