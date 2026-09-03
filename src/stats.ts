import type { ModelShare, SkillShare, Stats, UsageRecord } from './types.js';

/**
 * Calendar day in the viewer's own timezone.
 *
 * Transcript timestamps are UTC. Slicing the ISO string would give every user
 * the UTC answer, so an evening session west of Greenwich would be split across
 * two days — wrong for active-day counts and fatal for streaks.
 */
export function localDay(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Model id as a person would say it: "claude-sonnet-4-5-20250929" -> "Sonnet 4.5".
 *
 * Two naming eras are in play and they order the parts oppositely
 * ("claude-3-5-haiku-..." against "claude-haiku-4-5-..."), so the family is
 * read as the first non-numeric segment rather than by position. An id that
 * does not parse is returned untouched — a wrong model name is worse than a
 * raw one, and Bedrock, Vertex and future families all arrive through here.
 */
export function displayModel(raw: string): string {
  if (!raw) return '';
  // "us.anthropic.claude-opus-4-5-20251101-v1:0" — vendor prefix, then suffix.
  const vendor = raw.lastIndexOf('anthropic.');
  let id = vendor === -1 ? raw : raw.slice(vendor + 'anthropic.'.length);
  // "[1m]" is a context-window tier of the same model, not a different one.
  id = id.replace(/\[[^\]]*\]$/, '').replace(/-v\d+:\d+$/, '');
  if (!id.startsWith('claude-')) return raw;

  const segments = id
    .slice('claude-'.length)
    .split('-')
    .filter((part) => part && !/^\d{8}$/.test(part));
  const family = segments.find((part) => !/^\d+$/.test(part));
  if (!family) return raw;

  const version = segments.filter((part) => /^\d+$/.test(part)).join('.');
  const name = family.charAt(0).toUpperCase() + family.slice(1).toLowerCase();
  return version ? `${name} ${version}` : name;
}

/** Guarded division — an empty dataset must yield 0, never NaN or Infinity. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function sumBy<K>(
  records: UsageRecord[],
  key: (r: UsageRecord) => K,
  value: (r: UsageRecord) => number,
): Map<K, number> {
  const map = new Map<K, number>();
  for (const record of records) {
    const k = key(record);
    map.set(k, (map.get(k) ?? 0) + value(record));
  }
  return map;
}

export function computeStats(records: UsageRecord[]): Stats {
  const written = records.reduce((n, r) => n + r.output, 0);
  const cacheRead = records.reduce((n, r) => n + r.cacheRead, 0);
  const contextRead = records.reduce((n, r) => n + r.input + r.cacheCreate + r.cacheRead, 0);

  const days = [...new Set(records.map((r) => localDay(r.ts)).filter(Boolean))].sort();

  // Date-only strings parse as UTC, so both endpoints shift together and the
  // difference is always a whole number of days — DST cannot skew it.
  const elapsedDays =
    days.length === 0
      ? 0
      : Math.round((Date.parse(days[days.length - 1]!) - Date.parse(days[0]!)) / 86_400_000) + 1;

  const subagents = records.filter((r) => r.isSubagent);

  const byProject = [...sumBy(records, (r) => r.project, (r) => r.output).values()].sort((a, b) => b - a);

  // Grouped by display name, so one model on two context tiers is one entry.
  const byModel = sumBy(records, (r) => displayModel(r.model), (r) => r.output);
  const models: ModelShare[] = [...byModel.entries()]
    .map(([model, w]) => ({ model, written: w, share: ratio(w, written) }))
    .sort((a, b) => b.written - a.written);

  const skilled = records.filter((r) => r.skill !== null);
  const skillWritten = skilled.reduce((n, r) => n + r.output, 0);
  const bySkill = sumBy(skilled, (r) => r.skill as string, (r) => r.output);
  const ranked: SkillShare[] = [...bySkill.entries()]
    .map(([skill, w]) => ({ skill, written: w, share: ratio(w, skillWritten) }))
    .sort((a, b) => b.written - a.written);
  const topSkills = ranked.slice(0, 4);

  return {
    calls: records.length,
    firstDay: days[0] ?? '',
    lastDay: days[days.length - 1] ?? '',
    activeDays: days.length,
    elapsedDays,
    written,
    contextRead,
    readWriteRatio: ratio(contextRead, written),
    cacheShare: ratio(cacheRead, contextRead),
    subagentCallShare: ratio(subagents.length, records.length),
    subagentWrittenShare: ratio(subagents.reduce((n, r) => n + r.output, 0), written),
    repoCount: byProject.length,
    topThreeShare: ratio(byProject.slice(0, 3).reduce((n, w) => n + w, 0), written),
    topRepoShare: ratio(byProject[0] ?? 0, written),
    skillAttributedShare: ratio(skillWritten, written),
    distinctSkills: bySkill.size,
    topSkills,
    topFourSkillShare: topSkills.reduce((n, s) => n + s.share, 0),
    models,
  };
}
