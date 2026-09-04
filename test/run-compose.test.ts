import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeNoCards, failureWarnings, renderJson, htmlWrittenMessage, run } from '../src/run.js';
import { analyseSource } from '../src/pipeline.js';
import { claudeCode } from '../src/sources/claude-code/index.js';
import { throwingSource } from './helpers/fake-source.js';
import { localDay } from '../src/stats.js';
import type { Source } from '../src/sources/types.js';
import type { SourceOutcome } from '../src/pipeline.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureHome = join(repo, 'test', 'fixtures', 'claude-code');
const NOW = new Date('2026-08-04T12:00:00.000');

/**
 * A second source that always fails, so the multi-source composition rules can
 * be exercised without a second agent being installed anywhere. Named "broken"
 * rather than "fake" because synthetic.test.ts has a *succeeding* fake, and the
 * two used to share the id `fake` with opposite contracts.
 */
const brokenAgent: Source = throwingSource('broken');

test('a lone failing source produces the exact pre-registry message', () => {
  const notInstalled: SourceOutcome = { ok: false, reason: 'not-installed' };
  const out = describeNoCards([claudeCode], [notInstalled]);
  assert.equal(
    out,
    'No Claude Code transcripts found under ~/.claude/projects.\nNothing to read — and nothing was sent anywhere.',
  );
});

test('several failed sources are each named, not folded into one generic message', () => {
  const outcomes: SourceOutcome[] = [{ ok: false, reason: 'not-installed' }, { ok: false, reason: 'failed' }];
  const out = describeNoCards([claudeCode, brokenAgent], outcomes);
  assert.match(out, /Claude Code: no history found/);
  assert.match(out, /Broken Agent: could not be read/);
  assert.match(out, /Nothing to read — and nothing was sent anywhere\.$/);
});

test('a source failure is reported, not dropped, once another source has a card', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  const bad = await analyseSource(brokenAgent, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  if (bad.ok) throw new Error('expected the fake agent to fail');

  const warnings = failureWarnings([claudeCode, brokenAgent], [good, bad]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /Broken Agent: could not be read/);
});

test('a warning states the failure it actually was, not "could not be read" for all four', () => {
  // Regression: failureWarnings ignored outcome.reason and printed "could not
  // be read" for every failure, so an installed-but-empty agent, or one with
  // nothing inside --since, was reported as unreadable beside a working card.
  // Only `failed` is actually an unreadable source.
  const outcomes: SourceOutcome[] = [
    { ok: false, reason: 'not-installed' },
    { ok: false, reason: 'failed' },
    { ok: false, reason: 'no-records', files: 7 },
    { ok: false, reason: 'empty-window', cutoff: '2026-09-01' },
  ];
  const four = outcomes.map((_, i) => ({ ...brokenAgent, id: `s${i}`, label: `Agent ${i}` }));
  const warnings = failureWarnings(four, outcomes);
  assert.deepEqual(warnings, [
    '  ⚠  Agent 0: no history found.',
    '  ⚠  Agent 1: could not be read.',
    '  ⚠  Agent 2: 7 transcript file(s) found, but no usable records.',
    '  ⚠  Agent 3: no activity since 2026-09-01.',
  ]);
  // No "try --source <id> to see the error in isolation": analyseSource
  // catches by design, so a single-source run prints prose and never the
  // underlying error — the advice pointed somewhere that cannot help.
  for (const line of warnings) assert.doesNotMatch(line, /in isolation/);
});

test('no warnings are produced when every selected source has a card', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  assert.deepEqual(failureWarnings([claudeCode], [good]), []);
});

test('the not-installed message comes from the source itself, not a special case in run.ts', () => {
  // Same id as the real Claude Code source, deliberately, with a different
  // sentence: if run.ts ever regresses to branching on `source.id ===
  // 'claude-code'` instead of reading `source.notInstalled`, this fixture
  // would get the real source's wording back instead of its own.
  const impostor: Source = { ...claudeCode, notInstalled: 'A sentence nobody hardcoded in run.ts.' };
  const out = describeNoCards([impostor], [{ ok: false, reason: 'not-installed' }]);
  // The first line is the source's, verbatim; the second is run.ts's own
  // reassurance, appended once for every source rather than copied into each
  // one's string. Together they are byte-identical in shape to the
  // pre-registry message the test above pins.
  assert.equal(out, 'A sentence nobody hardcoded in run.ts.\nNothing to read — and nothing was sent anywhere.');
});

test('run.ts hardcodes no Claude-specific path', async () => {
  // What used to sit alongside this — assert.doesNotMatch(src, /\.(id|label)\s*===/)
  // — is gone. The impostor test above pins the same regression
  // behaviourally: give a fake source Claude Code's own id and a different
  // `notInstalled` sentence, and any branch on identity hands back the real
  // source's wording instead. That is strictly better than a grep over source
  // text, which had unbounded false positives (any future legitimate id
  // comparison anywhere in this file) and blind spots it could not cover
  // anyway (`switch (source.id)`, `SOURCES[0]`).
  //
  // This grep stays: "no hardcoded ~/.claude in shared code" is a concrete
  // fact about the file rather than a proxy for a behaviour, and there is no
  // behavioural way to express it — a path that belongs to one source cannot
  // be observed from run.ts's output.
  const src = await readFile(join(repo, 'src', 'run.ts'), 'utf8');
  assert.doesNotMatch(src, /~\/\.claude/, 'the Claude-specific path belongs to src/sources/claude-code, not run.ts');
});

test('--json accounts for a failed source rather than silently omitting it', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  const bad = await analyseSource(brokenAgent, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  if (bad.ok) throw new Error('expected the fake agent to fail');

  const out = renderJson([claudeCode, brokenAgent], [good, bad]);
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed), ['sources']);
  assert.equal(parsed.sources['claude-code'].stats.calls, good.result.stats.calls);
  assert.equal(parsed.sources.broken.label, 'Broken Agent');
  assert.equal(parsed.sources.broken.reason, 'failed');
  assert.equal(parsed.sources.broken.stats, undefined);
});

test('--json keys by source id even when only one source was selected', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  const parsed = JSON.parse(renderJson([claudeCode], [good]));
  assert.deepEqual(Object.keys(parsed), ['sources']);
  assert.deepEqual(Object.keys(parsed.sources), ['claude-code']);
  assert.equal(parsed.sources['claude-code'].stats.calls, good.result.stats.calls);
});

test('--json exposes unsupported on a successful source, and never id or savedTo', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  const parsed = JSON.parse(renderJson([claudeCode], [good]));
  const one = parsed.sources['claude-code'];
  assert.deepEqual(
    Object.keys(one).sort(),
    ['delta', 'disk', 'label', 'previous', 'pruning', 'rhythm', 'signals', 'stats', 'unsupported'].sort(),
  );
  assert.deepEqual(one.unsupported, good.result.unsupported);
});

test('--json nulls every declared-unsupported figure instead of emitting the computed zero', async () => {
  // The fixture's figures are all non-zero (99% cache, 20% subagent calls, 2
  // skills, 1 limit event, 1 overload), and they are reused here under a
  // source that declares all four unsupported. So this proves the payload is
  // gated on the declared list, not on whether a number happens to be zero:
  // before the fix a Codex-shaped source emitted `cacheShare: 0` beside
  // `unsupported: ["cache"]`, and a consumer that does not read `unsupported`
  // charts that as "0% cache" for a provider that cannot report cache at all.
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  const blind: Source = { ...claudeCode, id: 'blind', label: 'Blind Agent' };
  const outcome: SourceOutcome = {
    ok: true,
    result: {
      ...good.result,
      id: 'blind',
      label: 'Blind Agent',
      unsupported: ['cache', 'skills', 'subagents', 'limitEvents'],
    },
  };

  const out = renderJson([blind], [outcome]);
  const one = JSON.parse(out).sources.blind;

  // cache
  assert.equal(one.stats.cacheShare, null);
  // subagents
  assert.equal(one.stats.subagentCallShare, null);
  assert.equal(one.stats.subagentWrittenShare, null);
  // skills
  assert.equal(one.stats.skillAttributedShare, null);
  assert.equal(one.stats.distinctSkills, null);
  assert.equal(one.stats.topSkills, null, 'null, not [] — [] is what a real measurement of none looks like');
  assert.equal(one.stats.topFourSkillShare, null);
  // limitEvents
  assert.equal(one.signals.limitEvents, null, 'null, not [] — same reason');
  assert.equal(one.signals.overloads, null);

  // Everything not governed by the declared list survives, with its real value.
  assert.equal(one.stats.calls, good.result.stats.calls);
  assert.equal(one.stats.readWriteRatio, good.result.stats.readWriteRatio);
  assert.equal(one.stats.repoCount, good.result.stats.repoCount);
  assert.equal(one.stats.activeDays, good.result.stats.activeDays);
  assert.deepEqual(one.stats.models, good.result.stats.models);
  assert.deepEqual(one.signals.toolCounts, good.result.signals.toolCounts);
  assert.equal(one.signals.userMessages, good.result.signals.userMessages);
  assert.deepEqual(one.rhythm, good.result.rhythm);
  assert.deepEqual(one.disk, good.result.disk);
  assert.equal(one.label, 'Blind Agent');
  assert.deepEqual(one.unsupported, ['cache', 'skills', 'subagents', 'limitEvents']);
  assert.deepEqual(
    Object.keys(one).sort(),
    ['delta', 'disk', 'label', 'previous', 'pruning', 'rhythm', 'signals', 'stats', 'unsupported'].sort(),
    'the same key set as a fully-supporting source — nulled, never dropped',
  );
});

test('a fully-supporting source keeps every figure in --json — no regression from the nulling', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  const one = JSON.parse(renderJson([claudeCode], [good])).sources['claude-code'];
  assert.equal(one.stats.cacheShare, good.result.stats.cacheShare);
  assert.equal(one.stats.subagentCallShare, good.result.stats.subagentCallShare);
  assert.equal(one.stats.skillAttributedShare, good.result.stats.skillAttributedShare);
  assert.deepEqual(one.stats.topSkills, good.result.stats.topSkills);
  assert.deepEqual(one.signals.limitEvents, good.result.signals.limitEvents);
  assert.equal(one.signals.overloads, good.result.signals.overloads);
});

test('--html reports a failed source rather than silently writing only the successful one', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  const bad = await analyseSource(brokenAgent, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  if (bad.ok) throw new Error('expected the fake agent to fail');

  const out = htmlWrittenMessage('/tmp/card.html', [claudeCode, brokenAgent], [good, bad]);
  assert.match(out, /^Wrote \/tmp\/card\.html/);
  assert.match(out, /Broken Agent: could not be read/);
});

test('--html says nothing extra when every selected source has a card', async () => {
  const good = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!good.ok) throw new Error('expected the claude-code fixture to succeed');
  const out = htmlWrittenMessage('/tmp/card.html', [claudeCode], [good]);
  assert.equal(out.split('\n').length, 2, 'byte-identical to the pre-fix two-line message');
});

test('--json on a run() with nothing installed anywhere still returns parseable JSON', async () => {
  // Regression: run()'s all-failed early return used to fire before the
  // --json check, so a --json consumer against an empty home received the
  // same plain-text sentence describeNoCards produces for a human — not even
  // valid JSON. Asserted by actually parsing the output, since an unparseable
  // string is exactly the defect: a shape mismatch a script could at least
  // detect, a syntax error it cannot.
  const empty = await mkdtemp(join(tmpdir(), 'aw-'));
  const out = await run(['--json'], empty);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, { sources: { 'claude-code': { label: 'Claude Code', reason: 'not-installed' } } });
});

test('--json on a --since window with no activity still returns parseable JSON, cutoff included', async () => {
  // Exercised through run() end to end, against the real fixture, since --since
  // makes this reachable without constructing a fake outcome: the fixture's
  // last activity is 2026-08-03, so a cutoff of 2026-09-01 leaves the source
  // installed with files on disk but nothing inside the window.
  const since = '2026-09-01';
  const out = await run(['--json', '--since', since, '--no-save'], fixtureHome);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, {
    sources: {
      'claude-code': {
        label: 'Claude Code',
        reason: 'empty-window',
        cutoff: localDay(new Date(`${since}T00:00:00`).toISOString()),
      },
    },
  });
});
