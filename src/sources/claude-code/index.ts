import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Source } from '../types.js';
import { discover } from './discover.js';
import { parseAll } from './parse.js';
import { detectPruning } from './pruning.js';

/**
 * Claude Code: JSONL transcripts under ~/.claude/projects, one directory per
 * project and one file per session, with nested subagents/ directories.
 *
 * Every Claude-Code-specific convention lives under this directory — the path
 * layout here, the .jsonl walk and directory-name decoding in discover.ts, the
 * line schema in parse.ts, and cleanupPeriodDays in pruning.ts.
 */
export const claudeCode: Source = {
  id: 'claude-code',
  label: 'Claude Code',
  root(home) {
    const dir = join(home, '.claude', 'projects');
    return existsSync(dir) ? dir : null;
  },
  // Only the part this source uniquely knows: where it looked. run.ts adds
  // the "nothing was sent anywhere" reassurance, in its own voice, once.
  notInstalled: 'No Claude Code transcripts found under ~/.claude/projects.',
  discover,
  parse: parseAll,
  pruning(home, stats, disk) {
    return detectPruning(join(home, '.claude', 'settings.json'), stats, disk);
  },
  // Claude Code is the source every field on the card was designed around.
  unsupported: [],
};
