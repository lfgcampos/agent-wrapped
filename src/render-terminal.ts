import type { SourceResult } from './pipeline.js';
import type { Unsupported } from './sources/types.js';
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

/** Whole minutes: a stretch measured to the second implies a precision it lacks. */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function hour12(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export function renderTerminal(result: SourceResult): string {
  const { stats, rhythm, signals, disk, pruning, delta, savedTo, label } = result;
  const omits = (field: Unsupported) => result.unsupported.includes(field);
  const lines: string[] = [];
  const header = `${label.toUpperCase()} · ${stats.activeDays} OF ${stats.elapsedDays} DAYS ACTIVE`;
  lines.push('');
  lines.push(`  ${header}${' '.repeat(Math.max(2, 58 - header.length))}${stats.firstDay} → ${stats.lastDay}`);
  lines.push('');
  lines.push(`         ${Math.round(stats.readWriteRatio)} : 1`);
  lines.push('         tokens read for every token written');
  lines.push('');
  lines.push('');
  const streak =
    rhythm.currentStreak > 0
      ? `${rhythm.currentStreak}-day streak`
      : `no streak right now · longest was ${rhythm.longestStreak}`;
  const stretch = rhythm.longestStretchMs > 0 ? ` · ${duration(rhythm.longestStretchMs)} at a stretch` : '';
  lines.push(`  ${streak} · longest ${rhythm.longestStreak}${stretch} · you work most at ${hour12(rhythm.peakHour)}`);
  lines.push(`  ${sparkline(rhythm.hours)}   ${pct(rhythm.weekendShare)} of your writing is weekend work`);
  lines.push('  00                      23');

  lines.push('');
  if (!omits('cache')) {
    lines.push(`  ${pct(stats.cacheShare).padStart(4)}   of what it read was cache — the same context, re-sent`);
  }
  if (!omits('subagents')) {
    lines.push(`  ${pct(stats.subagentCallShare).padStart(4)}   of your calls were subagents…`);
    lines.push(`  ${pct(stats.subagentWrittenShare).padStart(4)}   …but they wrote only that share of the words`);
  }
  // "3 of your 1 repos" is nonsense — the copy has to follow the repo count.
  if (stats.repoCount >= 3) {
    lines.push(`  ${pct(stats.topThreeShare).padStart(4)}   of your writing went to 3 of your ${stats.repoCount} repos`);
  } else if (stats.repoCount === 2) {
    lines.push(`  ${pct(stats.topRepoShare).padStart(4)}   of your writing went to your busier repo, of 2`);
  }
  // Same rule as the repos above: "of 1 models" is not a sentence.
  const model = stats.models[0];
  if (model) {
    const scope =
      stats.models.length === 1 ? 'the only model you used' : `of ${stats.models.length} models you used`;
    lines.push(`  ${pct(model.share).padStart(4)}   of your writing came from ${model.model}, ${scope}`);
  }

  if (!omits('skills') && stats.topSkills.length > 0) {
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

  {
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

    if (!omits('limitEvents') && (signals.limitEvents.length > 0 || signals.overloads > 0)) {
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
    lines.push(`     streak    ${arrow(rhythm.currentStreak, p.currentStreak, (n) => `${Math.round(n)} days`)}`);
    // Omitted rather than faked when the previous snapshot predates the field.
    if (p.longestStretchMs !== undefined) {
      lines.push(`     stretch   ${arrow(rhythm.longestStretchMs, p.longestStretchMs, duration)}`);
    }
    if (p.topSkill && stats.topSkills[0] && p.topSkill !== stats.topSkills[0].skill) {
      lines.push(`     top skill ${shortSkill(p.topSkill)} → ${shortSkill(stats.topSkills[0].skill)}`);
    }
    if (p.topModel && stats.models[0] && p.topModel !== stats.models[0].model) {
      lines.push(`     top model ${p.topModel} → ${stats.models[0].model}`);
    }
    if (delta.gapDays > 0) {
      lines.push('');
      lines.push(`     ⚠  ${delta.gapDays} days of history were deleted between these two runs.`);
      lines.push('        Run more often than your retention window to keep the record whole.');
    }
  }

  if (pruning?.atRisk) {
    lines.push('');
    lines.push(
      `  ⚠  ${stats.elapsedDays} days of history · ${gb(disk.bytesOnDisk)} on disk` +
        ` (${gb(disk.bytesPerDay)}/day)`,
    );
    lines.push('     Claude Code deletes transcripts after ~30 days by default,');
    lines.push('     so you are losing this data right now.');
    lines.push('');
    lines.push(
      `     Keeping a full year would cost you about ${gb(pruning.yearBytes)}.`,
    );
    lines.push(
      `     Suggested, in ~/.claude/settings.json:  "cleanupPeriodDays": ${pruning.suggestedDays}` +
        `   (~${gb(pruning.suggestedBytes)})`,
    );
    lines.push('');
    lines.push('     Cheaper alternative: keep 30 days and run this monthly. Each');
    lines.push('     snapshot is a few KB, so years of history cost under a megabyte.');
  }
  if (savedTo) {
    lines.push('');
    lines.push(`  saved a snapshot to ${savedTo}   (local only · --no-save to skip)`);
  }
  // This card exists to be screenshotted, and a screenshot loses every link
  // around it. This last line is what tells the next reader what they are
  // looking at — it is a printed string, not a network call. The domain
  // rather than the install command: the package is scoped, and a scope is
  // the part people mistype from a screenshot.
  lines.push('');
  lines.push('  agent-wrapped.dev');
  lines.push('');
  return lines.join('\n');
}

/**
 * Every source's card, in the order given.
 *
 * Separate cards rather than merged figures: read:write ratios from providers
 * that count cache differently do not add up, and a merged headline would be a
 * number that means nothing.
 */
export function renderCards(results: SourceResult[]): string {
  return results.map(renderTerminal).join('\n');
}
