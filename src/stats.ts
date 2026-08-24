import type { SkillShare, Stats, UsageRecord } from './types.js';

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

  const days = [...new Set(records.map((r) => r.ts.slice(0, 10)).filter(Boolean))].sort();

  const subagents = records.filter((r) => r.isSubagent);

  const byProject = [...sumBy(records, (r) => r.project, (r) => r.output).values()].sort((a, b) => b - a);

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
    written,
    contextRead,
    readWriteRatio: ratio(contextRead, written),
    cacheShare: ratio(cacheRead, contextRead),
    subagentCallShare: ratio(subagents.length, records.length),
    subagentWrittenShare: ratio(subagents.reduce((n, r) => n + r.output, 0), written),
    repoCount: byProject.length,
    topThreeShare: ratio(byProject.slice(0, 3).reduce((n, w) => n + w, 0), written),
    skillAttributedShare: ratio(skillWritten, written),
    distinctSkills: bySkill.size,
    topSkills,
    topFourSkillShare: topSkills.reduce((n, s) => n + s.share, 0),
  };
}
