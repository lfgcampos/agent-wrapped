import type { Retention, Stats } from './types.js';

const BAR_WIDTH = 14;

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Bar scaled against the largest skill so the top entry always fills the row. */
function bar(share: number, max: number): string {
  const filled = max === 0 ? 0 : Math.max(1, Math.floor((share / max) * BAR_WIDTH));
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BAR_WIDTH - filled));
}

function shortSkill(skill: string): string {
  return skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill;
}

export function renderTerminal(stats: Stats, retention: Retention): string {
  const lines: string[] = [];
  const header = `CLAUDE CODE · ${stats.activeDays} ACTIVE DAYS`;
  lines.push('');
  lines.push(`  ${header}${' '.repeat(Math.max(2, 58 - header.length))}${stats.firstDay} → ${stats.lastDay}`);
  lines.push('');
  lines.push(`         ${Math.round(stats.readWriteRatio)} : 1`);
  lines.push('         tokens read for every token written');
  lines.push('');
  lines.push(`  ${pct(stats.cacheShare).padStart(4)}   of what it read was cache — the same context, re-sent`);
  lines.push(`  ${pct(stats.subagentCallShare).padStart(4)}   of your calls were subagents…`);
  lines.push(`  ${pct(stats.subagentWrittenShare).padStart(4)}   …but they wrote only that share of the words`);
  lines.push(`  ${pct(stats.topThreeShare).padStart(4)}   of your writing went to 3 of your ${stats.repoCount} repos`);

  if (stats.topSkills.length > 0) {
    const max = stats.topSkills[0]!.share;
    lines.push('');
    lines.push(`  HOW YOU WORK   (% of words written inside a skill — ${pct(stats.skillAttributedShare)} of all work)`);
    for (const entry of stats.topSkills) {
      lines.push(`  ${bar(entry.share, max)}  ${pct(entry.share).padStart(3)}  ${shortSkill(entry.skill)}`);
    }
    lines.push(
      `  ${' '.repeat(BAR_WIDTH)}       …${stats.distinctSkills} skills used · top 4 = ${pct(stats.topFourSkillShare)} of skill work`,
    );
  }

  if (retention.atRisk) {
    lines.push('');
    lines.push(`  ⚠  ${retention.windowDays} days of history. Claude Code deletes transcripts after`);
    lines.push('     ~30 days by default — you are losing this data right now.');
    lines.push('');
    lines.push('     Fix, in ~/.claude/settings.json:   "cleanupPeriodDays": 365');
    lines.push('');
    lines.push('     Run this again in a month and you will have something to compare.');
  }
  lines.push('');
  return lines.join('\n');
}
