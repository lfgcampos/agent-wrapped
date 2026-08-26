import { join } from 'node:path';

/**
 * Everything this tool writes lives under one directory, and never under
 * ~/.claude — Claude Code prunes its own directory on a retention schedule,
 * which would delete the history we keep in order to survive it.
 */
export function dataDir(home: string): string {
  return join(home, '.agent-wrapped');
}

export function snapshotDir(home: string): string {
  return join(dataDir(home), 'snapshots');
}

/**
 * The rendered card. A single predictable path rather than a dated one: the
 * snapshots are the history, this is just the current rendering, and a path you
 * can memorise beats one you have to copy out of the terminal every time.
 */
export function cardPath(home: string): string {
  return join(dataDir(home), 'card.html');
}

/** How this platform opens a file from the shell. */
export function openCommand(platform: string = process.platform): string {
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'start';
  return 'xdg-open';
}
