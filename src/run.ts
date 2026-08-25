import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { discover } from './discover.js';
import { parseAll } from './parse.js';
import { computeStats } from './stats.js';
import { detectRetention } from './retention.js';
import { renderTerminal } from './render-terminal.js';
import { computeRhythm } from './rhythm.js';
import { parseSince } from './since.js';
import { buildSnapshot, computeDelta, loadPrevious, saveSnapshot, snapshotDir, todayStamp } from './snapshot.js';
import { localDay } from './stats.js';
import { renderHtml } from './render-html.js';

/**
 * Pure entry point: takes the home directory as a parameter so tests can point
 * it at a fixture tree. Importing this module must never execute anything —
 * that is why the bin wrapper lives in cli.ts.
 */
function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

export async function run(argv: string[], home: string): Promise<string> {
  const sinceRaw = flagValue(argv, '--since');
  let since: Date | null = null;
  if (sinceRaw !== undefined) {
    since = parseSince(sinceRaw);
    if (!since) {
      return `Could not understand --since "${sinceRaw}".\nUse a window like 30d, 12w, 6m — or a date like 2026-08-01.`;
    }
  }

  let files = await discover(join(home, '.claude', 'projects'));
  if (files.length === 0) {
    return 'No Claude Code transcripts found under ~/.claude/projects.\nNothing to read — and nothing was sent anywhere.';
  }
  if (since) {
    // A file last written before the cutoff cannot hold records after it, so it
    // is skipped without ever being opened. --since makes the scan cheaper.
    files = files.filter((f) => f.mtime >= since!.getTime());
  }

  let { records, signals } = await parseAll(files);

  if (since) {
    const cutoff = localDay(since.toISOString());
    records = records.filter((r) => localDay(r.ts) >= cutoff);
    if (records.length === 0) {
      return `No activity since ${cutoff}.`;
    }
  }
  if (records.length === 0) {
    return `Found ${files.length} transcript file(s), but no usable usage records in them.\nThis is normal for a brand-new install — come back after a few sessions.`;
  }
  const stats = computeStats(records);
  const rhythm = computeRhythm(records);
  const retention = await detectRetention(join(home, '.claude', 'settings.json'), stats, files);

  // Compare against the most recent earlier snapshot before writing today's.
  const dir = snapshotDir(home);
  const today = todayStamp();
  const previous = await loadPrevious(dir, today);
  const delta = previous ? computeDelta(previous, stats) : null;

  let savedTo: string | null = null;
  // Windowed runs describe a slice, not the whole history — never snapshot those.
  if (!argv.includes('--no-save') && !since) {
    try {
      savedTo = await saveSnapshot(dir, buildSnapshot(stats, rhythm, signals, today));
    } catch {
      savedTo = null; // a read-only home must not break the card
    }
  }

  if (argv.includes('--html')) {
    const out = join(tmpdir(), 'agent-wrapped.html');
    await writeFile(out, renderHtml(stats, retention, rhythm, signals), "utf8");
    return `Wrote ${out}\nOpen it with:  open ${out}`;
  }

  if (argv.includes('--json')) {
    // Project names are grouping keys only and must never be emitted.
    return JSON.stringify({ stats, rhythm, signals, retention, previous, delta }, null, 2);
  }
  return renderTerminal(stats, retention, rhythm, signals, delta, savedTo);
}
