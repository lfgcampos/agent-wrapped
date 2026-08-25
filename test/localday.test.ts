import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

/** Three calls that are one working day in Los Angeles but span two UTC days. */
async function eveningSession(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-p');
  await mkdir(project, { recursive: true });
  const rec = (id: string, ts: string) =>
    JSON.stringify({
      type: 'assistant', timestamp: ts,
      message: { id, model: 'claude-opus-5', usage: { output_tokens: 10, cache_read_input_tokens: 100 } },
    }) + '\n';
  await writeFile(
    join(project, 's.jsonl'),
    rec('a', '2026-08-01T16:00:00.000Z') + rec('b', '2026-08-02T00:00:00.000Z') + rec('c', '2026-08-02T01:00:00.000Z'),
  );
  return root;
}

async function activeDays(tz: string): Promise<string> {
  const { stdout } = await exec(process.execPath, [cli], {
    env: { ...process.env, HOME: await eveningSession(), TZ: tz },
  });
  return stdout.match(/(\d+) ACTIVE DAYS/)![1]!;
}

test('an evening session counts as one local day, not two UTC days', async () => {
  assert.equal(await activeDays('America/Los_Angeles'), '1');
});

test('the same data spans two days for a UTC user', async () => {
  assert.equal(await activeDays('UTC'), '2');
});

test('reports a clear message when files exist but hold no usable records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-p');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 's.jsonl'), '{"type":"user","message":{}}\n');
  const { stdout } = await exec(process.execPath, [cli], { env: { ...process.env, HOME: root } });
  assert.match(stdout, /no usable/i);
  assert.doesNotMatch(stdout, /0 ACTIVE DAYS/);
});
