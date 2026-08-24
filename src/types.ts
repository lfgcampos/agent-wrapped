/** One transcript file on disk, already classified. */
export interface TranscriptFile {
  path: string;
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

export interface Stats {
  calls: number;
  firstDay: string;
  lastDay: string;
  activeDays: number;
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
  /** Tokens written inside any skill / all tokens written. */
  skillAttributedShare: number;
  distinctSkills: number;
  /** Up to four entries, descending by written. */
  topSkills: SkillShare[];
  topFourSkillShare: number;
}

export interface Retention {
  /** Days between first and last record, inclusive. */
  windowDays: number;
  /** From ~/.claude/settings.json, null when unset. */
  cleanupPeriodDays: number | null;
  /** True when history is being silently deleted. */
  atRisk: boolean;
}
