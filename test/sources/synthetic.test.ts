import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseSource } from '../../src/pipeline.js';
import type { SourceResult } from '../../src/pipeline.js';
import { renderTerminal, renderCards } from '../../src/render-terminal.js';
import { renderHtml } from '../../src/render-html.js';
import type { Source } from '../../src/sources/types.js';
import type { Signals, UsageRecord } from '../../src/types.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fakeHome = join(repo, 'test', 'fixtures', 'fake');
const NOW = new Date('2026-08-03T12:00:00.000');

/**
 * A second source that shares no convention with Claude Code: a flat
 * directory, its own line schema, and no skills, subagents, cache or limits.
 *
 * Its purpose is to fail if a Claude-specific assumption is reintroduced
 * downstream. It is a better test than a real second agent would be — hermetic,
 * and immune to an upstream directory reorganisation.
 */
const fake: Source = {
  id: 'fake',
  label: 'Fake Agent',
  notInstalled: 'No Fake Agent history found.',
  root(home) {
    const dir = join(home, '.fake', 'sessions');
    return existsSync(dir) ? dir : null;
  },
  async discover(root) {
    const path = join(root, 's1.jsonl');
    return [{ path, size: 128, mtime: 0, project: 'proj', fromSubagentDir: false }];
  },
  async parse(files) {
    const records: UsageRecord[] = [];
    for (const f of files) {
      for (const line of (await readFile(f.path, 'utf8')).split('\n').filter(Boolean)) {
        const j = JSON.parse(line);
        records.push({
          id: j.ts, ts: j.ts, model: 'fake-model-1',
          input: j.in, output: j.out, cacheCreate: 0, cacheRead: 0,
          project: f.project, isSubagent: false, skill: null,
        });
      }
    }
    const signals: Signals = { toolCounts: {}, userMessages: 0, limitEvents: [], overloads: 0, sessionCalls: {} };
    return { records, signals };
  },
  unsupported: ['skills', 'subagents', 'cache', 'limitEvents'],
};

/** Run the fake source, unwrapping the discriminated outcome into its result. */
async function analyseFake(): Promise<SourceResult> {
  const outcome = await analyseSource(fake, fakeHome, { since: null, save: false, now: NOW });
  if (!outcome.ok) throw new Error('expected the synthetic source to produce a result');
  return outcome.result;
}

async function fakeCard(): Promise<string> {
  return renderTerminal(await analyseFake());
}

test('a second source needs no change to stats, rhythm or the renderers', async () => {
  const card = await fakeCard();
  assert.match(card, /FAKE AGENT/, 'the label reaches the header');
  assert.match(card, /2 OF 2 DAYS ACTIVE/);
  assert.match(card, /: 1/, 'the ratio still renders');
});

test('unsupported cache is omitted, never printed as zero', async () => {
  const card = await fakeCard();
  assert.doesNotMatch(card, /of what it read was cache/);
  assert.doesNotMatch(card, /0%\s+of what it read/);
});

test('unsupported skills omit the whole panel', async () => {
  const card = await fakeCard();
  assert.doesNotMatch(card, /HOW YOU WORK/);
  assert.doesNotMatch(card, /skills used/);
});

test('unsupported subagents omit both rows', async () => {
  const card = await fakeCard();
  assert.doesNotMatch(card, /were subagents/);
  assert.doesNotMatch(card, /share of the words/);
});

test('unsupported limit events omit the battle scars panel', async () => {
  const card = await fakeCard();
  assert.doesNotMatch(card, /BATTLE SCARS/);
});

test('a source with no pruning advice still reports its disk figure', async () => {
  const r = await analyseFake();
  assert.equal(r.pruning, null);
  assert.ok(r.disk.bytesOnDisk > 0);
});

test('two sources render as two cards, in registry order', async () => {
  const a = await analyseFake();
  const out = renderCards([a, { ...a, id: 'fake2', label: 'Second Agent' }]);
  assert.ok(out.indexOf('FAKE AGENT') < out.indexOf('SECOND AGENT'));
});

test('the HTML page carries a section per source and no external requests', async () => {
  const a = await analyseFake();
  const html = renderHtml([a]);
  assert.match(html, /FAKE AGENT/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /of what it read was cache/);
});
