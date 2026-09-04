import type { Disk, Pruning, Signals, Stats, TranscriptFile, UsageRecord } from '../types.js';

/**
 * A field the card can show that a given source cannot know.
 *
 * Declared rather than inferred, because a zero is a wrong number where a
 * missing figure is an honest one: "0% cache" reads as "you never hit cache",
 * not as "this cannot be known here".
 *
 * The list is short on purpose, and this is the rule for adding to it: a
 * field whose absence is honestly representable as zero-or-empty needs no
 * declaration — the renderers already drop those sections on their own
 * (`repoCount < 2`, no `models[0]`, `userMessages === 0`, empty `toolCounts`,
 * empty `limitEvents`), and "no repos to group by" is the truth in that case,
 * not a guess. These four are declared because a zero in them would read as a
 * measurement: 0% of a denominator the source never had. So a source with no
 * per-project grouping simply reports one repo and loses the line through the
 * zero-guard; a source with no cache accounting must say so here.
 */
export type Unsupported = 'skills' | 'subagents' | 'cache' | 'limitEvents';

/** One agent whose local history this tool can read. */
export interface Source {
  /** Stable key. Goes in the snapshot filename and the --json object. */
  id: string;
  /** Human name for the card header. */
  label: string;
  /** Where this agent keeps its data, or null when it is not installed. */
  root(home: string): string | null;
  /**
   * What to print when this source is not installed.
   *
   * The source owns this string rather than the caller composing one, because
   * only the source knows how to describe its own location in a way worth
   * showing someone — `root()` returns null when absent, so the path is not
   * recoverable generically, and an absolute path is worse to read than the
   * `~`-relative form each agent documents itself with.
   */
  notInstalled: string;
  discover(root: string): Promise<TranscriptFile[]>;
  parse(files: TranscriptFile[]): Promise<{ records: UsageRecord[]; signals: Signals }>;
  /**
   * Pruning advice, for an agent that deletes history on a schedule.
   * Omitted entirely by sources that do not prune.
   */
  pruning?(home: string, stats: Stats, disk: Disk): Promise<Pruning | null>;
  unsupported: ReadonlyArray<Unsupported>;
}
