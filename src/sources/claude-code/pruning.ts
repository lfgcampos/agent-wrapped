import { readFile } from 'node:fs/promises';
import type { Disk, Pruning, Stats } from '../../types.js';

/** Claude Code's default transcript retention, in days. */
const DEFAULT_RETENTION_DAYS = 30;

/** Below this, a short window means "new user", not "data being deleted". */
const RISK_THRESHOLD_DAYS = 25;

/**
 * Disk we are willing to suggest someone spend on transcripts.
 *
 * A blanket "keep 365 days" is bad advice: a heavy user writes ~27 MB/day, so a
 * year is nearly 10 GB. The recommendation is derived from the user's own rate
 * instead, and the year figure is shown so they can overrule it knowingly.
 */
const DISK_BUDGET_BYTES = 2_000_000_000;
const HORIZONS = [60, 90, 180, 365];

/**
 * Decide whether the user is silently losing history.
 *
 * An absent or unparseable settings file means the default retention applies,
 * which is the common case and the whole reason this check exists.
 *
 * Takes `disk` because every figure it suggests is derived from the growth
 * rate: the advice is "how many days fit in a disk budget at your rate".
 */
export async function detectPruning(
  settingsPath: string,
  stats: Stats,
  disk: Disk,
): Promise<Pruning | null> {
  let cleanupPeriodDays: number | null = null;
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8'));
    const value = parsed?.cleanupPeriodDays;
    if (typeof value === 'number' && Number.isFinite(value)) cleanupPeriodDays = value;
  } catch {
    // absent or malformed: the default is in force
  }
  const unconfigured = cleanupPeriodDays === null || cleanupPeriodDays <= DEFAULT_RETENTION_DAYS;

  // Largest horizon whose projected cost still fits the budget; never below the smallest.
  const affordable = HORIZONS.filter((d) => disk.bytesPerDay * d <= DISK_BUDGET_BYTES);
  const suggestedDays = affordable.length > 0 ? affordable[affordable.length - 1]! : HORIZONS[0]!;

  return {
    cleanupPeriodDays,
    atRisk: unconfigured && stats.elapsedDays >= RISK_THRESHOLD_DAYS,
    suggestedDays,
    suggestedBytes: disk.bytesPerDay * suggestedDays,
    yearBytes: disk.bytesPerDay * 365,
  };
}
