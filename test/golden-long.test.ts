import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseSource } from '../src/pipeline.js';
import { claudeCode } from '../src/sources/claude-code/index.js';
import { renderTerminal } from '../src/render-terminal.js';
import type { Snapshot } from '../src/types.js';

/**
 * A second golden, for the two panels the first one cannot reach.
 *
 * `test/fixtures/claude-code/` spans three days, so `pruning.atRisk` is false
 * (the threshold is 25) and its card carries no retention warning, and it has
 * no stored snapshot so it carries no delta panel either. Those are the two
 * sections whose data shape the source refactor actually changed — `Retention`
 * split into `Disk` + `Pruning` — and they were the last part of the card with
 * no end-to-end evidence behind them.
 *
 * This fixture spans 27 days and gets a stale snapshot injected, so both
 * render. The first golden stays frozen: it was captured before the refactor
 * and its value is that provenance, which regenerating would destroy.
 *
 * On magnitudes: the fixture's files are small, so the disk figures render as
 * `0 MB`. That is honest, and the point here is path coverage — the GB/MB
 * formatting branches are covered by the unit tests in
 * `test/render-terminal.test.ts`, which assert against `9.7 GB` and `26 MB/day`.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(repo, 'test', 'fixtures', 'claude-code-long');
const goldenPath = join(repo, 'test', 'fixtures', 'golden-claude-code-long.txt');

/** Pinned, so the streak and the snapshot key cannot drift with the wall clock. */
const NOW = new Date('2026-08-01T12:00:00.000');

/** Sixteen days before the fixture's last active day, so the delta has a gap to report. */
const STALE: Snapshot = {
  version: 1,
  takenAt: '2026-07-15',
  firstDay: '2026-07-05',
  lastDay: '2026-07-15',
  activeDays: 2,
  calls: 2,
  written: 400000,
  readWriteRatio: 60,
  cacheShare: 0.9,
  subagentCallShare: 0,
  currentStreak: 1,
  longestStreak: 1,
  weekendShare: 0,
  peakHour: 10,
  humanTurns: 1,
  limitEvents: 0,
  overloads: 0,
  sessions: 1,
  topSkill: 'superpowers:brainstorming',
  topTool: 'Bash',
  toolCounts: { Bash: 2 },
};

/**
 * The fixture is copied to a temp home and the snapshot injected there rather
 * than committed, because a `.agent-wrapped` directory inside `test/fixtures/`
 * would trip the pollution guard in `golden.test.ts` — and that guard is worth
 * more than the convenience of a committed snapshot.
 */
async function longHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'aw-long-'));
  await cp(fixture, home, { recursive: true });
  const snapshots = join(home, '.agent-wrapped', 'snapshots');
  await mkdir(snapshots, { recursive: true });
  await writeFile(join(snapshots, '2026-07-15.claude-code.json'), JSON.stringify(STALE), 'utf8');
  return home;
}

async function renderLongCard(): Promise<string> {
  const outcome = await analyseSource(claudeCode, await longHome(), {
    since: null,
    save: false,
    now: NOW,
  });
  assert.ok(outcome.ok, 'the long fixture must produce a card');
  return renderTerminal(outcome.result);
}

test('the long-window card matches its golden fixture byte for byte', async () => {
  const actual = await renderLongCard();
  if (process.env.UPDATE_GOLDEN === '1') {
    await writeFile(goldenPath, actual, 'utf8');
    assert.fail(
      `Regenerated ${goldenPath}.\n` +
        'Review the diff, then re-run without UPDATE_GOLDEN=1. A regeneration is never a pass.',
    );
  }
  assert.equal(actual, await readFile(goldenPath, 'utf8'));
});

test('the long-window card renders the retention warning the short fixture cannot reach', async () => {
  const card = await renderLongCard();
  assert.match(card, /days of history/, 'the atRisk block must render');
  assert.match(card, /cleanupPeriodDays/, 'it must name the setting to change');
});

test('the long-window card renders the delta panel the short fixture cannot reach', async () => {
  const card = await renderLongCard();
  assert.match(card, /SINCE YOUR LAST SNAPSHOT/);
  assert.match(card, /2026-07-15/, 'the delta names the snapshot it compared against');
});
