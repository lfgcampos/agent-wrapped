import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { TranscriptFile } from './types.js';

/**
 * Reduce an encoded transcript directory name to a stable grouping key.
 * Strips the leading home-directory prefix and folds worktree checkouts
 * into their parent repo. The result is never rendered — it only groups.
 */
export function normalizeProject(dirName: string): string {
  return dirName
    .replace(/^-(Users|home)-[^-]+-/, '')
    .replace(/--?worktrees?-.*$/, '');
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory is not fatal
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
  }
}

/**
 * Find every transcript under `root`, including the nested
 * `<session>/subagents/agent-*.jsonl` files, which hold most of the files.
 */
export async function discover(root: string): Promise<TranscriptFile[]> {
  const paths: string[] = [];
  await walk(root, paths);
  return paths.map((path) => {
    const rel = path.slice(root.length + 1);
    const segments = rel.split(sep);
    return {
      path,
      project: normalizeProject(segments[0]!),
      fromSubagentDir: segments.includes('subagents'),
    };
  });
}
