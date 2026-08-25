import type { Retention, Rhythm, Signals, Stats } from './types.js';
import { toolShares, sessionStats } from './rhythm.js';
import { pct } from './render-terminal.js';

/** Skill names come from disk and are interpolated into markup, so escape them. */
function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (c) => map[c] as string);
}

function shortSkill(skill: string): string {
  return escapeHtml(skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill);
}

export function renderHtml(
  stats: Stats,
  retention: Retention,
  rhythm?: Rhythm,
  signals?: Signals,
): string {
  const spark = rhythm
    ? rhythm.hours
        .map((n) => {
          const max = Math.max(...rhythm.hours, 1);
          return `<i style="height:${Math.max(6, Math.round((n / max) * 44))}px"></i>`;
        })
        .join('')
    : '';
  const streakBlock = rhythm
    ? `<h2>Rhythm</h2>
       <p class="big">${rhythm.currentStreak > 0 ? `${rhythm.currentStreak}-day streak` : 'no active streak'}
         <span class="sub2">longest ${rhythm.longestStreak} &middot; peak hour ${rhythm.peakHour}:00 &middot; ${pct(rhythm.weekendShare)} weekend work</span></p>
       <div class="spark">${spark}</div>`
    : '';
  const toolBlock = (() => {
    if (!signals) return '';
    const tools = toolShares(signals.toolCounts).slice(0, 4);
    if (tools.length === 0) return '';
    const total = Object.values(signals.toolCounts).reduce((n, v) => n + v, 0);
    const rows = tools
      .map((t) => `<tr><td class="bar"><span style="width:${Math.round(t.share * 100)}%"></span></td><td class="num">${pct(t.share)}</td><td>${escapeHtml(t.tool)}</td></tr>`)
      .join('');
    return `<h2>What you reach for &mdash; % of ${total.toLocaleString('en-US')} tool calls</h2><table>${rows}</table>`;
  })();
  const scarBlock = (() => {
    if (!signals || (signals.limitEvents.length === 0 && signals.overloads === 0)) return '';
    const parts: string[] = [];
    if (signals.limitEvents.length > 0) parts.push(`<div class="stat"><b>${signals.limitEvents.length}</b><span>times you hit the usage limit</span></div>`);
    if (signals.overloads > 0) parts.push(`<div class="stat"><b>${signals.overloads}</b><span>times the server was overloaded on you</span></div>`);
    return `<h2>Battle scars</h2>${parts.join('')}`;
  })();
  const turnBlock = (() => {
    if (!signals || signals.userMessages === 0) return '';
    const s = sessionStats(signals.sessionCalls);
    return `<p class="sub">${(stats.calls / signals.userMessages).toFixed(1)} agent turns for every message you send &middot; ${s.count} sessions &middot; longest ${s.largest.toLocaleString('en-US')} turns</p>`;
  })();

  const rows = stats.topSkills
    .map(
      (s) =>
        `<tr><td class="bar"><span style="width:${Math.round(s.share * 100)}%"></span></td>` +
        `<td class="num">${pct(s.share)}</td><td>${shortSkill(s.skill)}</td></tr>`,
    )
    .join('\n');

  const warning = retention.atRisk
    ? `<p class="warn">&#9888; ${retention.windowDays} days of history &middot; ${(retention.bytesOnDisk / 1e6).toFixed(0)} MB on disk (${(retention.bytesPerDay / 1e6).toFixed(0)} MB/day). Claude Code deletes transcripts after ~30 days by default. A full year would cost about ${(retention.yearBytes / 1e9).toFixed(1)} GB &mdash; set <code>"cleanupPeriodDays": ${retention.suggestedDays}</code> in <code>~/.claude/settings.json</code> for roughly ${(retention.suggestedBytes / 1e9).toFixed(1)} GB.</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>agent-wrapped</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --dim:#666; --accent:#c2410c; }
  @media (prefers-color-scheme: dark) { :root { --fg:#eee; --bg:#111; --dim:#999; --accent:#fb923c; } }
  body { background:var(--bg); color:var(--fg); font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0; padding:3rem 1.5rem; }
  main { max-width:44rem; margin:0 auto; }
  .ratio { font-size:clamp(3rem,12vw,6rem); font-weight:700; letter-spacing:-.03em; margin:0; }
  .sub { color:var(--dim); margin:.25rem 0 2.5rem; }
  .stat { display:flex; gap:1rem; margin:.4rem 0; }
  .stat b { min-width:3.5rem; text-align:right; color:var(--accent); }
  h2 { font-size:.8rem; letter-spacing:.06em; text-transform:uppercase; color:var(--dim); margin:2.5rem 0 .75rem; font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  td { padding:.2rem 0; vertical-align:middle; }
  td.bar { width:45%; } td.bar span { display:block; height:.6rem; background:var(--accent); border-radius:2px; }
  td.num { width:3.5rem; text-align:right; padding-right:.75rem; color:var(--dim); }
  .warn { border-left:3px solid var(--accent); padding-left:1rem; color:var(--dim); margin-top:2.5rem; }
  code { background:rgba(128,128,128,.15); padding:.1rem .3rem; border-radius:3px; }
  .big { font-size:1.6rem; font-weight:700; margin:.2rem 0; }
  .sub2 { display:block; font-size:.9rem; font-weight:400; color:var(--dim); }
  .spark { display:flex; align-items:flex-end; gap:2px; height:48px; margin:.75rem 0 0; }
  .spark i { flex:1; background:var(--accent); opacity:.75; border-radius:1px; }
</style></head>
<body><main>
  <p class="sub">CLAUDE CODE &middot; ${stats.activeDays} ACTIVE DAYS &middot; ${stats.firstDay} &rarr; ${stats.lastDay}</p>
  <p class="ratio">${Math.round(stats.readWriteRatio)} : 1</p>
  <p class="sub">tokens read for every token written</p>
  <div class="stat"><b>${pct(stats.cacheShare)}</b><span>of what it read was cache &mdash; the same context, re-sent</span></div>
  <div class="stat"><b>${pct(stats.subagentCallShare)}</b><span>of your calls were subagents&hellip;</span></div>
  <div class="stat"><b>${pct(stats.subagentWrittenShare)}</b><span>&hellip;but they wrote only that share of the words</span></div>
  ${stats.repoCount >= 3
    ? `<div class="stat"><b>${pct(stats.topThreeShare)}</b><span>of your writing went to 3 of your ${stats.repoCount} repos</span></div>`
    : stats.repoCount === 2
      ? `<div class="stat"><b>${pct(stats.topRepoShare)}</b><span>of your writing went to your busier repo, of 2</span></div>`
      : ''}
  ${streakBlock}
  <h2>How you work &mdash; % of words written inside a skill (${pct(stats.skillAttributedShare)} of all work)</h2>
  <table>${rows}</table>
  <p class="sub">${stats.distinctSkills} skills used &middot; top 4 = ${pct(stats.topFourSkillShare)} of skill work</p>
  ${toolBlock}
  ${turnBlock}
  ${scarBlock}
  ${warning}
</main></body></html>`;
}
