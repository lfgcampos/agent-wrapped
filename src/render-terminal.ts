import type { Delta, Retention, Rhythm, Signals, Stats } from './types.js';
import { toolShares, sessionStats } from './rhythm.js';

const BAR_WIDTH = 14;

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Bar scaled against the largest skill so the top entry always fills the row. */
function bar(share: number, max: number): string {
  const filled = max === 0 ? 0 : Math.max(1, Math.floor((share / max) * BAR_WIDTH));
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BAR_WIDTH - filled));
}

/**
 * Lead with the current value, then the direction and the old one.
 * "↑ 12.4M — was 15.2M" invites reading 12.4M as today's figure; it is the change.
 */
function arrow(now: number, before: number, format: (n: number) => string): string {
  if (before === 0 || Math.abs(now - before) < 1e-9) return `${format(now)}  (unchanged)`;
  return `${format(now)}  ${now > before ? '↑' : '↓'} from ${format(before)}`;
}

function gb(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function shortSkill(skill: string): string {
  return skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill;
}

const SPARK = '▁▂▃▄▅▆▇█';

/** 24-hour activity as one line of block characters. */
function sparkline(hours: number[]): string {
  const max = Math.max(...hours, 1);
  return hours.map((n) => SPARK[Math.min(7, Math.round((n / max) * 7))]).join('');
}

function hour12(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export function renderTerminal(
  stats: Stats,
  retention: Retention,
  rhythm?: Rhythm,
  signals?: Signals,
  delta?: Delta | null,
  savedTo?: string | null,
): string {
  const lines: string[] = [];
  const header = `CLAUDE CODE · ${stats.activeDays} ACTIVE DAYS`;
  lines.push('');
  lines.push(`  ${header}${' '.repeat(Math.max(2, 58 - header.length))}${stats.firstDay} → ${stats.lastDay}`);
  lines.push('');
  lines.push(`         ${Math.round(stats.readWriteRatio)} : 1`);
  lines.push('         tokens read for every token written');
  lines.push('');
  if (rhythm) {
    lines.push('');
    const streak =
      rhythm.currentStreak > 0
        ? `${rhythm.currentStreak}-day streak`
        : `no streak right now · longest was ${rhythm.longestStreak}`;
    lines.push(`  ${streak} · longest ${rhythm.longestStreak} · you work most at ${hour12(rhythm.peakHour)}`);
    lines.push(`  ${sparkline(rhythm.hours)}   ${pct(rhythm.weekendShare)} of your writing is weekend work`);
    lines.push('  00                      23');
  }

  lines.push('');
  lines.push(`  ${pct(stats.cacheShare).padStart(4)}   of what it read was cache — the same context, re-sent`);
  lines.push(`  ${pct(stats.subagentCallShare).padStart(4)}   of your calls were subagents…`);
  lines.push(`  ${pct(stats.subagentWrittenShare).padStart(4)}   …but they wrote only that share of the words`);
  // "3 of your 1 repos" is nonsense — the copy has to follow the repo count.
  if (stats.repoCount >= 3) {
    lines.push(`  ${pct(stats.topThreeShare).padStart(4)}   of your writing went to 3 of your ${stats.repoCount} repos`);
  } else if (stats.repoCount === 2) {
    lines.push(`  ${pct(stats.topRepoShare).padStart(4)}   of your writing went to your busier repo, of 2`);
  }

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

  if (signals) {
    const tools = toolShares(signals.toolCounts).slice(0, 4);
    if (tools.length > 0) {
      const total = Object.values(signals.toolCounts).reduce((n, v) => n + v, 0);
      lines.push('');
      lines.push(`  WHAT YOU REACH FOR                    (% of ${total.toLocaleString('en-US')} tool calls)`);
      const max = tools[0]!.share;
      for (const t of tools) {
        lines.push(`  ${bar(t.share, max)}  ${pct(t.share).padStart(3)}  ${t.tool}`);
      }
    }

    const sessions = sessionStats(signals.sessionCalls);
    if (signals.userMessages > 0 && sessions.count > 0) {
      lines.push('');
      lines.push(
        `  ${(stats.calls / signals.userMessages).toFixed(1)} agent turns for every message you send` +
          ` · ${sessions.count} sessions, longest ${sessions.largest.toLocaleString('en-US')} turns`,
      );
    }

    if (signals.limitEvents.length > 0 || signals.overloads > 0) {
      const weeks = new Set(
        signals.limitEvents.map((e) => {
          const d = new Date(e.day);
          const t = new Date(d.getFullYear(), 0, 1);
          return `${d.getFullYear()}-${Math.ceil(((d.getTime() - t.getTime()) / 86400000 + t.getDay() + 1) / 7)}`;
        }),
      ).size;
      lines.push('');
      lines.push('  BATTLE SCARS');
      if (signals.limitEvents.length > 0) {
        lines.push(
          `  ${String(signals.limitEvents.length).padStart(4)}   times you hit the usage limit, across ${weeks} week${weeks === 1 ? '' : 's'}`,
        );
      }
      if (signals.overloads > 0) {
        lines.push(`  ${String(signals.overloads).padStart(4)}   times the server was overloaded on you`);
      }
    }
  }

  if (delta) {
    const p = delta.previous;
    const daysApart = Math.max(0, Math.round((Date.parse(stats.lastDay) - Date.parse(p.takenAt)) / 86_400_000));
    lines.push('');
    lines.push(`  SINCE YOUR LAST SNAPSHOT   (${p.takenAt}, ${daysApart} days ago)`);
    lines.push(`     ratio     ${arrow(stats.readWriteRatio, p.readWriteRatio, (n) => `${Math.round(n)} : 1`)}`);
    lines.push(`     written   ${arrow(stats.written, p.written, (n) => `${(n / 1e6).toFixed(1)}M`)}`);
    if (rhythm) {
      lines.push(`     streak    ${arrow(rhythm.currentStreak, p.currentStreak, (n) => `${Math.round(n)} days`)}`);
    }
    if (p.topSkill && stats.topSkills[0] && p.topSkill !== stats.topSkills[0].skill) {
      lines.push(`     top skill ${shortSkill(p.topSkill)} → ${shortSkill(stats.topSkills[0].skill)}`);
    }
    if (delta.gapDays > 0) {
      lines.push('');
      lines.push(`     ⚠  ${delta.gapDays} days of history were deleted between these two runs.`);
      lines.push('        Run more often than your retention window to keep the record whole.');
    }
  }

  if (retention.atRisk) {
    lines.push('');
    lines.push(
      `  ⚠  ${retention.windowDays} days of history · ${gb(retention.bytesOnDisk)} on disk` +
        ` (${gb(retention.bytesPerDay)}/day)`,
    );
    lines.push('     Claude Code deletes transcripts after ~30 days by default,');
    lines.push('     so you are losing this data right now.');
    lines.push('');
    lines.push(
      `     Keeping a full year would cost you about ${gb(retention.yearBytes)}.`,
    );
    lines.push(
      `     Suggested, in ~/.claude/settings.json:  "cleanupPeriodDays": ${retention.suggestedDays}` +
        `   (~${gb(retention.suggestedBytes)})`,
    );
    lines.push('');
    lines.push('     Cheaper alternative: keep 30 days and run this monthly. Each');
    lines.push('     snapshot is a few KB, so years of history cost under a megabyte.');
  }
  if (savedTo) {
    lines.push('');
    lines.push(`  saved a snapshot to ${savedTo}   (local only · --no-save to skip)`);
  }
  lines.push('');
  return lines.join('\n');
}
