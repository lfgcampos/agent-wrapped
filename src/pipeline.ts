import type { Delta, Disk, Pruning, Rhythm, Signals, Snapshot, Stats } from './types.js';
import type { Source, Unsupported } from './sources/types.js';
import { computeStats, localDay } from './stats.js';
import { computeRhythm } from './rhythm.js';
import { computeDisk } from './disk.js';
import { buildSnapshot, computeDelta, loadPrevious, saveSnapshot, snapshotDir, todayStamp } from './snapshot.js';

/** Everything one source contributes to one run. */
export interface SourceResult {
  id: string;
  label: string;
  unsupported: ReadonlyArray<Unsupported>;
  stats: Stats;
  rhythm: Rhythm;
  signals: Signals;
  disk: Disk;
  pruning: Pruning | null;
  previous: Snapshot | null;
  delta: Delta | null;
  savedTo: string | null;
}

export interface AnalyseOptions {
  since: Date | null;
  save: boolean;
  /** Injected so the "is the streak still alive" rule stays testable. */
  now?: Date;
}

/**
 * Why a source produced no card, when it produced none.
 *
 * A bare null cannot tell "not installed" apart from "installed but nothing
 * in this window" apart from "installed, has files, but every one failed to
 * parse" — and those are different facts. Conflating them is not just a
 * wording nicety: a tool whose whole pitch is that every figure states its
 * denominator cannot tell someone "no transcripts found" while forty of
 * their transcripts sit on disk, just outside --since.
 */
export type SourceOutcome =
  | { ok: true; result: SourceResult }
  | { ok: false; reason: 'not-installed' }
  | { ok: false; reason: 'failed' }
  | { ok: false; reason: 'no-records'; files: number }
  | { ok: false; reason: 'empty-window'; cutoff: string };

/**
 * Run one source end to end.
 *
 * Returns a discriminated outcome rather than an empty result or a thrown
 * error: the source may be absent (`not-installed`), present but with no
 * usable records anywhere (`no-records`, carrying how many files were read),
 * present but with nothing inside the requested `--since` window
 * (`empty-window`, carrying the cutoff day), or it may fail outright
 * (`failed`). The caller needs to say something accurate about each rather
 * than a single "nothing here" that can be false.
 *
 * A source that throws is `{ ok: false, reason: 'failed' }`: one agent
 * reorganising its state directory must not take down every other source's
 * card with it.
 */
export async function analyseSource(
  source: Source,
  home: string,
  opts: AnalyseOptions,
): Promise<SourceOutcome> {
  try {
    // One clock for the whole pipeline. computeRhythm's streak rule and the snapshot
    // key must agree, and there is an await between them — a run straddling local
    // midnight would otherwise compute the streak against one day and key the
    // snapshot under the next.
    const now = opts.now ?? new Date();

    const root = source.root(home);
    if (!root) return { ok: false, reason: 'not-installed' };

    let files = await source.discover(root);
    if (files.length === 0) return { ok: false, reason: 'not-installed' };
    // A file last written before the cutoff cannot hold records after it, so it
    // is skipped without ever being opened. --since makes the scan cheaper.
    if (opts.since) files = files.filter((f) => f.mtime >= opts.since!.getTime());

    let { records, signals } = await source.parse(files);
    if (opts.since) {
      const cutoff = localDay(opts.since.toISOString());
      records = records.filter((r) => localDay(r.ts) >= cutoff);
      if (records.length === 0) return { ok: false, reason: 'empty-window', cutoff };
    } else if (records.length === 0) {
      return { ok: false, reason: 'no-records', files: files.length };
    }

    const stats = computeStats(records);
    const rhythm = computeRhythm(records, now);
    const disk = computeDisk(files, stats);
    const pruning = source.pruning ? await source.pruning(home, stats, disk) : null;

    const dir = snapshotDir(home);
    const today = todayStamp(now);
    const previous = await loadPrevious(dir, today, source.id);
    const delta = previous ? computeDelta(previous, stats) : null;

    let savedTo: string | null = null;
    if (opts.save) {
      try {
        savedTo = await saveSnapshot(dir, buildSnapshot(stats, rhythm, signals, today), source.id);
      } catch {
        savedTo = null; // a read-only home must not break the card
      }
    }

    return {
      ok: true,
      result: {
        id: source.id,
        label: source.label,
        unsupported: source.unsupported,
        stats, rhythm, signals, disk, pruning, previous, delta, savedTo,
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
