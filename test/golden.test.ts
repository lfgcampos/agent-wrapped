import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseSource } from '../src/pipeline.js';
import { claudeCode } from '../src/sources/claude-code/index.js';
import { renderTerminal } from '../src/render-terminal.js';

// dist-test/test/… → repo root
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturesRoot = join(root, 'test', 'fixtures');
const fixtureHome = join(fixturesRoot, 'claude-code');
const goldenPath = join(fixturesRoot, 'golden-claude-code.txt');

/** Pinned so currentStreak cannot drift with the wall clock. */
const NOW = new Date('2026-08-04T12:00:00.000');

/** The exact chain run.ts performs today, with the clock pinned. */
export async function renderFixtureCard(): Promise<string> {
  const outcome = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!outcome.ok) throw new Error(`expected the claude-code fixture to succeed, got ${outcome.reason}`);
  return renderTerminal(outcome.result);
}

test('the rendered card matches the golden fixture byte for byte', async () => {
  const actual = await renderFixtureCard();
  if (process.env.UPDATE_GOLDEN === '1') {
    // Rewrite and then fail, deliberately. This fixture is the only evidence
    // that a refactor changed no behaviour, so a regeneration must never come
    // back green: a green run with the flag set is indistinguishable from a
    // green run without it, and the diff would sail through unreviewed.
    await writeFile(goldenPath, actual, 'utf8');
    assert.fail(
      `Golden fixture regenerated: ${goldenPath}\n` +
        'This run FAILS on purpose. Review the diff (git diff -- test/fixtures/golden-claude-code.txt): ' +
        'every changed byte is a change to what the card prints, and must be one you meant. ' +
        'Then re-run `npm test` WITHOUT UPDATE_GOLDEN=1 — that run, and only that run, is the passing one.',
    );
  }
  const expected = await readFile(goldenPath, 'utf8');
  assert.equal(actual, expected);
});

/**
 * Every source writes under `dataDir(home)`, which is `<home>/.agent-wrapped`
 * (see src/paths.ts) — both the snapshot (`snapshots/*.json`, written whenever
 * `save` is not explicitly false) and the `--html` card (`card.html`) live
 * there. Find any such directory anywhere under test/fixtures.
 */
async function findAgentWrappedDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === '.agent-wrapped') {
      found.push(full);
    } else {
      found.push(...(await findAgentWrappedDirs(full)));
    }
  }
  return found;
}

test('the fixture tree has no leftover .agent-wrapped directory', async () => {
  // A fixture home is a real `home` argument, so hand-running the CLI against
  // one — exactly what verifying this suite's own output requires — writes a
  // real ~/.agent-wrapped there: a snapshot (save defaults to true) or a
  // card.html (--html). A leftover snapshot is the dangerous one: the next
  // `npm test` run finds it as "previous", computeDelta fires, and the golden
  // card above grows an entire delta panel nobody wrote — a confusing failure
  // that looks like a renderer regression instead of what it is.
  const leftovers = await findAgentWrappedDirs(fixturesRoot);
  assert.deepEqual(
    leftovers,
    [],
    `Found ${leftovers.length} leftover .agent-wrapped director${leftovers.length === 1 ? 'y' : 'ies'} ` +
      `under test/fixtures: ${leftovers.join(', ')}\n` +
      'This is written by a previous manual run against a fixture home (a plain run or --json writes ' +
      'a snapshot, --html writes card.html) — save defaults to true. Delete the directory/directories ' +
      'listed above, then re-run. When hand-running against a fixture home, pass --no-save (CLI) or ' +
      '{ save: false } (analyseSource) to avoid writing into it again.',
  );
});
