import { readFile } from 'node:fs/promises';
import type { Retention, Stats } from './types.js';

/** Claude Code's default transcript retention, in days. */
const DEFAULT_RETENTION_DAYS = 30;

/** Below this, a short window means "new user", not "data being deleted". */
const RISK_THRESHOLD_DAYS = 25;

function daysBetween(firstDay: string, lastDay: string): number {
  if (!firstDay || !lastDay) return 0;
  const ms = Date.parse(lastDay) - Date.parse(firstDay);
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / 86_400_000) + 1; // inclusive of both endpoints
}

/**
 * Decide whether the user is silently losing history.
 *
 * An absent or unparseable settings file means the default retention applies,
 * which is the common case and the whole reason this check exists.
 */
export async function detectRetention(settingsPath: string, stats: Stats): Promise<Retention> {
  let cleanupPeriodDays: number | null = null;
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8'));
    const value = parsed?.cleanupPeriodDays;
    if (typeof value === 'number' && Number.isFinite(value)) cleanupPeriodDays = value;
  } catch {
    // absent or malformed: the default is in force
  }
  const windowDays = daysBetween(stats.firstDay, stats.lastDay);
  const unconfigured = cleanupPeriodDays === null || cleanupPeriodDays <= DEFAULT_RETENTION_DAYS;
  return {
    windowDays,
    cleanupPeriodDays,
    atRisk: unconfigured && windowDays >= RISK_THRESHOLD_DAYS,
  };
}
