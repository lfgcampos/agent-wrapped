import type { SourceResult } from './pipeline.js';
import type { Unsupported } from './sources/types.js';
import { toolShares, sessionStats } from './rhythm.js';
import { duration, pct } from './render-terminal.js';

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

/** One source's section of the page: everything between the header and the retention warning. */
function card(result: SourceResult): string {
  const { stats, rhythm, signals, disk, pruning, label } = result;
  const omits = (field: Unsupported) => result.unsupported.includes(field);

  const spark = rhythm.hours
    .map((n) => {
      const max = Math.max(...rhythm.hours, 1);
      return `<i style="height:${Math.max(6, Math.round((n / max) * 44))}px"></i>`;
    })
    .join('');
  const streakBlock = `<h2>Rhythm</h2>
       <p class="big">${rhythm.currentStreak > 0 ? `${rhythm.currentStreak}-day streak` : 'no active streak'}
         <span class="sub2">longest ${rhythm.longestStreak} &middot; peak hour ${rhythm.peakHour}:00 &middot; ${pct(rhythm.weekendShare)} weekend work${rhythm.longestStretchMs > 0 ? ` &middot; ${duration(rhythm.longestStretchMs)} at a stretch` : ''}</span></p>
       <div class="spark">${spark}</div>`;
  const modelBlock = (() => {
    const model = stats.models[0];
    if (!model) return '';
    // Same rule as the repos: "of 1 models" is not a sentence.
    const scope =
      stats.models.length === 1 ? 'the only model you used' : `of ${stats.models.length} models you used`;
    return `<div class="stat"><b>${pct(model.share)}</b><span>of your writing came from ${escapeHtml(model.model)}, ${scope}</span></div>`;
  })();
  const toolBlock = (() => {
    const tools = toolShares(signals.toolCounts).slice(0, 4);
    if (tools.length === 0) return '';
    const total = Object.values(signals.toolCounts).reduce((n, v) => n + v, 0);
    const rows = tools
      .map((t) => `<tr><td class="bar"><span style="width:${Math.round(t.share * 100)}%"></span></td><td class="num">${pct(t.share)}</td><td>${escapeHtml(t.tool)}</td></tr>`)
      .join('');
    return `<h2>What you reach for &mdash; % of ${total.toLocaleString('en-US')} tool calls</h2><table>${rows}</table>`;
  })();
  const scarBlock = (() => {
    if (omits('limitEvents')) return '';
    if (signals.limitEvents.length === 0 && signals.overloads === 0) return '';
    const parts: string[] = [];
    if (signals.limitEvents.length > 0) parts.push(`<div class="stat"><b>${signals.limitEvents.length}</b><span>times you hit the usage limit</span></div>`);
    if (signals.overloads > 0) parts.push(`<div class="stat"><b>${signals.overloads}</b><span>times the server was overloaded on you</span></div>`);
    return `<h2>Battle scars</h2>${parts.join('')}`;
  })();
  const turnBlock = (() => {
    if (signals.userMessages === 0) return '';
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
  const skillsBlock = !omits('skills') && stats.topSkills.length > 0
    ? `<h2>How you work &mdash; % of words written inside a skill (${pct(stats.skillAttributedShare)} of all work)</h2>
  <table>${rows}</table>
  <p class="sub">${stats.distinctSkills} skills used &middot; top 4 = ${pct(stats.topFourSkillShare)} of skill work</p>`
    : '';

  const cacheStat = !omits('cache')
    ? `<div class="stat"><b>${pct(stats.cacheShare)}</b><span>of what it read was cache &mdash; the same context, re-sent</span></div>`
    : '';
  const subagentStats = !omits('subagents')
    ? `<div class="stat"><b>${pct(stats.subagentCallShare)}</b><span>of your calls were subagents&hellip;</span></div>
  <div class="stat"><b>${pct(stats.subagentWrittenShare)}</b><span>&hellip;but they wrote only that share of the words</span></div>`
    : '';
  const repoBlock = stats.repoCount >= 3
    ? `<div class="stat"><b>${pct(stats.topThreeShare)}</b><span>of your writing went to 3 of your ${stats.repoCount} repos</span></div>`
    : stats.repoCount === 2
      ? `<div class="stat"><b>${pct(stats.topRepoShare)}</b><span>of your writing went to your busier repo, of 2</span></div>`
      : '';

  const warning = pruning?.atRisk
    ? `<p class="warn">&#9888; ${stats.elapsedDays} days of history &middot; ${(disk.bytesOnDisk / 1e6).toFixed(0)} MB on disk (${(disk.bytesPerDay / 1e6).toFixed(0)} MB/day). Claude Code deletes transcripts after ~30 days by default. A full year would cost about ${(pruning.yearBytes / 1e9).toFixed(1)} GB &mdash; set <code>"cleanupPeriodDays": ${pruning.suggestedDays}</code> in <code>~/.claude/settings.json</code> for roughly ${(pruning.suggestedBytes / 1e9).toFixed(1)} GB.</p>`
    : '';

  return `<section>
  <p class="sub">${escapeHtml(label.toUpperCase())} &middot; ${stats.activeDays} OF ${stats.elapsedDays} DAYS ACTIVE &middot; ${stats.firstDay} &rarr; ${stats.lastDay}</p>
  <p class="ratio">${Math.round(stats.readWriteRatio)} : 1</p>
  <p class="sub">tokens read for every token written</p>
  ${cacheStat}
  ${subagentStats}
  ${repoBlock}
  ${modelBlock}
  ${streakBlock}
  ${skillsBlock}
  ${toolBlock}
  ${turnBlock}
  ${scarBlock}
  ${warning}
</section>`;
}

/**
 * One self-contained page, one section per source.
 *
 * A second source needs no change here: it gets its own section from the same
 * `card()`, gated by the same `unsupported` list every renderer reads.
 */
export function renderHtml(results: SourceResult[]): string {
  const first = results[0]!;
  const firstOmits = (field: Unsupported) => first.unsupported.includes(field);
  // The share PNG is one image with one headline, so it shows the first
  // source. Aggregating across providers that count cache differently would
  // produce a number that means nothing.
  //
  // A field the first source cannot know is carried as null, not as a
  // computed-but-wrong percentage: the drawing code below skips a null line
  // entirely rather than ever putting "0%" on the canvas for something that
  // was never measured.
  const shareData = JSON.stringify({
    ratio: Math.round(first.stats.readWriteRatio),
    cache: firstOmits('cache') ? null : pct(first.stats.cacheShare),
    subCalls: firstOmits('subagents') ? null : pct(first.stats.subagentCallShare),
    subWords: firstOmits('subagents') ? null : pct(first.stats.subagentWrittenShare),
    days: first.stats.activeDays,
    from: first.stats.firstDay,
    to: first.stats.lastDay,
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>agent-wrapped</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --dim:#666; --accent:#c2410c; }
  @media (prefers-color-scheme: dark) { :root { --fg:#eee; --bg:#111; --dim:#999; --accent:#fb923c; } }
  body { background:var(--bg); color:var(--fg); font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0; padding:3rem 1.5rem; }
  main { max-width:44rem; margin:0 auto; }
  section + section { margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(128,128,128,.25); }
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
  #share { font:inherit; font-size:.85rem; cursor:pointer; margin:.5rem 0 0;
    background:transparent; color:var(--accent); border:1px solid var(--accent);
    border-radius:4px; padding:.45rem .9rem; }
  #share:hover { background:var(--accent); color:var(--bg); }
  #share:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .big { font-size:1.6rem; font-weight:700; margin:.2rem 0; }
  .sub2 { display:block; font-size:.9rem; font-weight:400; color:var(--dim); }
  .spark { display:flex; align-items:flex-end; gap:2px; height:48px; margin:.75rem 0 0; }
  .spark i { flex:1; background:var(--accent); opacity:.75; border-radius:1px; }
</style></head>
<body><main>
  <button type="button" id="share">Save as image</button>
  <canvas id="sheet" width="1200" height="630" hidden></canvas>
  ${results.map(card).join('\n')}
</main>
<script>
(() => {
  const d = ${shareData};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const button = document.getElementById('share');
  const canvas = document.getElementById('sheet');

  function draw() {
    const c = canvas.getContext('2d');
    c.fillStyle = '#0c0a09';
    c.fillRect(0, 0, 1200, 630);

    // The mark: the ratio itself — a column read, a sliver written.
    c.fillStyle = '#fb923c';
    c.fillRect(72, 52, 15, 44);
    c.fillRect(96, 90, 15, 6);
    c.font = '700 34px ' + MONO;
    c.fillStyle = '#e7e5e4';
    c.fillText('agent-wrapped', 130, 88);

    c.fillStyle = '#fb923c';
    c.font = '700 190px ' + MONO;
    c.fillText(d.ratio + ' : 1', 68, 330);

    c.fillStyle = '#a8a29e';
    c.font = '36px ' + MONO;
    c.fillText('tokens read for every token written', 72, 388);

    c.font = '26px ' + MONO;
    c.fillStyle = '#78716c';
    // A null field is a source that cannot know this figure — the line is
    // dropped, not drawn as a blank or as a wrong "0%". Remaining lines close
    // up rather than leaving a gap where it would have been.
    const facts = [];
    if (d.cache !== null) facts.push(d.cache + ' of it was cache');
    if (d.subCalls !== null && d.subWords !== null) {
      facts.push(d.subCalls + ' of calls were subagents, ' + d.subWords + ' of the words');
    }
    facts.push(d.days + ' active days  ·  ' + d.from + ' to ' + d.to);
    facts.forEach((line, i) => c.fillText(line, 72, 452 + i * 38));

    c.fillStyle = '#57534e';
    c.font = '24px ' + MONO;
    c.fillText('agent-wrapped.dev', 72, 588);
  }

  button.addEventListener('click', () => {
    draw();
    canvas.toBlob((blob) => {
      if (!blob) { button.textContent = 'Could not render'; return; }
      // A local object URL — the image is never sent anywhere.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'agent-wrapped.png';
      link.click();
      URL.revokeObjectURL(url);
      button.textContent = 'Saved';
      setTimeout(() => { button.textContent = 'Save as image'; }, 1800);
    }, 'image/png');
  });
})();
</script>
</body></html>`;
}
