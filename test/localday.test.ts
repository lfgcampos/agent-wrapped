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
  // One fixture home, used for both variables: os.homedir() reads HOME on
  // POSIX and USERPROFILE on Windows.
  const home = await eveningSession();
  const { stdout } = await exec(process.execPath, [cli], {
    env: { ...process.env, HOME: home, USERPROFILE: home, TZ: tz },
  });
  return stdout.match(/(\d+) OF \d+ DAYS ACTIVE/)![1]!;
}

test('an evening session counts as one local day, not two UTC days', async () => {
  assert.equal(await activeDays('America/Los_Angeles'), '1');
});

test('the same data spans two days for a UTC user', async () => {
  assert.equal(await activeDays('UTC'), '2');
});

test('the far side of the date line folds the same data into one day', async () => {
  // Kiritimati is UTC+14 all year, so all three records land on 2 August local.
  assert.equal(await activeDays('Pacific/Kiritimati'), '1');
});

test('a half-hour offset still cuts the day at local midnight', async () => {
  // Kolkata is UTC+05:30. Offsets that are not whole hours are where day
  // arithmetic tends to go wrong, and 00:00 UTC is 05:30 the next day here.
  assert.equal(await activeDays('Asia/Kolkata'), '2');
});

test('reports a clear message when files exist but hold no usable records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-p');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 's.jsonl'), '{"type":"user","message":{}}\n');
  const { stdout } = await exec(process.execPath, [cli], { env: { ...process.env, HOME: root, USERPROFILE: root } });
  assert.match(stdout, /no usable/i);
  assert.doesNotMatch(stdout, /0 OF 0 DAYS ACTIVE/);
});

test('reports a clear message when the --since window contains no activity', async () => {
  // This case was previously untested, which is exactly how a message that
  // claimed "no transcripts found" — false, since the evening session's
  // transcripts are right there, just outside the window — went unnoticed.
  const home = await eveningSession();
  const { stdout } = await exec(process.execPath, [cli, '--since', '2026-09-01'], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.match(stdout, /No activity since 2026-09-01\./);
  assert.doesNotMatch(stdout, /No Claude Code transcripts found/);
});

/** A usage-wall notice at 21:00 in Los Angeles, which is the NEXT day in UTC. */
async function limitEventDay(tz: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'aw-limit-'));
  const project = join(home, '.claude', 'projects', '-Users-me-p');
  await mkdir(project, { recursive: true });
  const usage = JSON.stringify({
    type: 'assistant', timestamp: '2026-08-02T04:00:00.000Z',
    message: { id: 'm1', model: 'claude-opus-5', usage: { output_tokens: 10, cache_read_input_tokens: 100 } },
  }) + '\n';
  const wall = JSON.stringify({
    type: 'assistant', timestamp: '2026-08-02T04:00:00.000Z', isApiErrorMessage: true,
    message: { content: [{ type: 'text', text: 'You have hit your session limit. It resets 10:00pm.' }] },
  }) + '\n';
  await writeFile(join(project, 's.jsonl'), usage + wall);
  const { stdout } = await exec(process.execPath, [cli, '--json', '--no-save'], {
    env: { ...process.env, HOME: home, USERPROFILE: home, TZ: tz },
  });
  return JSON.parse(stdout).sources['claude-code'].signals.limitEvents[0].day;
}

test('a usage wall is filed under the local day, not the UTC day', async () => {
  // 04:00Z on Aug 2 is 21:00 on Aug 1 in Los Angeles. Slicing the ISO string
  // would file it under Aug 2 and inflate the "across N weeks" figure.
  assert.equal(await limitEventDay('America/Los_Angeles'), '2026-08-01');
});

test('the same wall is the UTC day for a UTC user', async () => {
  assert.equal(await limitEventDay('UTC'), '2026-08-02');
});
