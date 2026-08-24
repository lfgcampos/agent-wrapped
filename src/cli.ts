#!/usr/bin/env node
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { discover } from './discover.js';
import { parseAll } from './parse.js';
import { computeStats } from './stats.js';
import { detectRetention } from './retention.js';
import { renderTerminal } from './render-terminal.js';
import { renderHtml } from './render-html.js';

export async function run(argv: string[], home: string): Promise<string> {
  const files = await discover(join(home, '.claude', 'projects'));
  if (files.length === 0) {
    return 'No Claude Code transcripts found under ~/.claude/projects.\nNothing to read — and nothing was sent anywhere.';
  }
  const records = await parseAll(files);
  const stats = computeStats(records);
  const retention = await detectRetention(join(home, '.claude', 'settings.json'), stats);

  if (argv.includes('--html')) {
    const out = join(tmpdir(), 'agent-wrapped.html');
    await writeFile(out, renderHtml(stats, retention), 'utf8');
    return `Wrote ${out}\nOpen it with:  open ${out}`;
  }

  if (argv.includes('--json')) {
    // Project names are grouping keys only and must never be emitted.
    return JSON.stringify({ stats, retention }, null, 2);
  }
  return renderTerminal(stats, retention);
}

const invokedDirectly = process.argv[1]?.endsWith('cli.js');
if (invokedDirectly) {
  run(process.argv.slice(2), homedir())
    .then((output) => process.stdout.write(output + '\n'))
    .catch((error: unknown) => {
      process.stderr.write(
        `agent-wrapped failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
