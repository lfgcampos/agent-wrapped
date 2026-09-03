import { readFile } from 'node:fs/promises';
import type { Retention, Stats, TranscriptFile } from './types.js';

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
 */
export async function detectRetention(
  settingsPath: string,
  stats: Stats,
  files: TranscriptFile[] = [],
): Promise<Retention> {
  let cleanupPeriodDays: number | null = null;
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8'));
    const value = parsed?.cleanupPeriodDays;
    if (typeof value === 'number' && Number.isFinite(value)) cleanupPeriodDays = value;
  } catch {
    // absent or malformed: the default is in force
  }
  // Same span computeStats already measured — deriving it twice lets the two
  // figures drift apart on the same card.
  const windowDays = stats.elapsedDays;
  const unconfigured = cleanupPeriodDays === null || cleanupPeriodDays <= DEFAULT_RETENTION_DAYS;

  const bytesOnDisk = files.reduce((n, f) => n + f.size, 0);
  const bytesPerDay = stats.activeDays > 0 ? bytesOnDisk / stats.activeDays : 0;
  // Largest horizon whose projected cost still fits the budget; never below the smallest.
  const affordable = HORIZONS.filter((d) => bytesPerDay * d <= DISK_BUDGET_BYTES);
  const suggestedDays = affordable.length > 0 ? affordable[affordable.length - 1]! : HORIZONS[0]!;

  return {
    windowDays,
    cleanupPeriodDays,
    atRisk: unconfigured && windowDays >= RISK_THRESHOLD_DAYS,
    bytesOnDisk,
    bytesPerDay,
    suggestedDays,
    suggestedBytes: bytesPerDay * suggestedDays,
    yearBytes: bytesPerDay * 365,
  };
}
