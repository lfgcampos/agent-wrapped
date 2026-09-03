/** One transcript file on disk, already classified. */
export interface TranscriptFile {
  path: string;
  /** Bytes on disk — feeds the size-aware retention advice. */
  size: number;
  /** Last-write time in ms. Used to skip files entirely under --since. */
  mtime: number;
  /** Grouping key only — never rendered. */
  project: string;
  /** True when the file lives under a `subagents/` directory. */
  fromSubagentDir: boolean;
}

/** One deduplicated API response. */
export interface UsageRecord {
  /** message.id, falling back to requestId. Deduplication key. */
  id: string;
  /** ISO-8601 timestamp as written in the transcript. */
  ts: string;
  model: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  project: string;
  isSubagent: boolean;
  skill: string | null;
}

export interface SkillShare {
  skill: string;
  written: number;
  /** Fraction of tokens written inside any skill, 0..1. */
  share: number;
}

export interface ModelShare {
  /** Display name, so two context tiers of one model collapse into one entry. */
  model: string;
  written: number;
  /** Fraction of all tokens written, 0..1. */
  share: number;
}

export interface Stats {
  calls: number;
  firstDay: string;
  lastDay: string;
  activeDays: number;
  /** First to last active day, inclusive. Never smaller than activeDays. */
  elapsedDays: number;
  written: number;
  contextRead: number;
  /** contextRead / written. The headline. */
  readWriteRatio: number;
  /** cacheRead / contextRead, 0..1. */
  cacheShare: number;
  subagentCallShare: number;
  subagentWrittenShare: number;
  repoCount: number;
  /** Tokens written in the top three projects / all tokens written. */
  topThreeShare: number;
  /** Tokens written in the single busiest project / all tokens written. */
  topRepoShare: number;
  /** Tokens written inside any skill / all tokens written. */
  skillAttributedShare: number;
  distinctSkills: number;
  /** Up to four entries, descending by written. */
  topSkills: SkillShare[];
  topFourSkillShare: number;
  /** Every model used, ranked by tokens written. */
  models: ModelShare[];
}

export interface Retention {
  /** Days between first and last record, inclusive. */
  windowDays: number;
  /** Total bytes of transcripts on disk. */
  bytesOnDisk: number;
  /** Average bytes written per active day. */
  bytesPerDay: number;
  /** Retention horizon that fits the disk budget, in days. */
  suggestedDays: number;
  /** Projected disk cost of `suggestedDays`, in bytes. */
  suggestedBytes: number;
  /** Projected disk cost of keeping a full year, in bytes. */
  yearBytes: number;
  /** From ~/.claude/settings.json, null when unset. */
  cleanupPeriodDays: number | null;
  /** True when history is being silently deleted. */
  atRisk: boolean;
}

/** One time the user hit a usage wall. Deduplicated by day + reset time. */
export interface LimitEvent {
  day: string;
  /** As written by Claude Code — "session" is the only kind seen so far. */
  kind: string;
  resets: string;
}

/**
 * Everything that is not token usage: tool calls, turns, sessions, walls hit.
 * Collected in the same single pass over the transcripts.
 */
export interface Signals {
  toolCounts: Record<string, number>;
  userMessages: number;
  limitEvents: LimitEvent[];
  overloads: number;
  /** session id -> assistant call count */
  sessionCalls: Record<string, number>;
}

export interface Rhythm {
  /** 24 buckets, local hours. */
  hours: number[];
  peakHour: number;
  /** Longest run of calls with no pause over 30 minutes, in ms. */
  longestStretchMs: number;
  /** Share of tokens written on Saturday or Sunday, 0..1. */
  weekendShare: number;
  currentStreak: number;
  longestStreak: number;
}

export interface ToolShare {
  tool: string;
  calls: number;
  share: number;
}

/** A tiny, durable summary of one run — kilobytes, so years of them cost nothing. */
export interface Snapshot {
  version: 1;
  takenAt: string;
  firstDay: string;
  lastDay: string;
  activeDays: number;
  calls: number;
  written: number;
  readWriteRatio: number;
  cacheShare: number;
  subagentCallShare: number;
  currentStreak: number;
  longestStreak: number;
  weekendShare: number;
  peakHour: number;
  humanTurns: number;
  limitEvents: number;
  overloads: number;
  sessions: number;
  topSkill: string | null;
  topTool: string | null;
  /**
   * Optional: absent from snapshots written before these fields existed.
   * loadPrevious accepts version 1 only, so the version must never be bumped
   * for an additive field — that would discard every snapshot on disk.
   */
  topModel?: string | null;
  longestStretchMs?: number;
  toolCounts: Record<string, number>;
}

export interface Delta {
  previous: Snapshot;
  /** Days of history missing between the two snapshots, 0 when continuous. */
  gapDays: number;
}
