import type { Source } from './types.js';
import { claudeCode } from './claude-code/index.js';

/**
 * Every source this build knows about. Registry order is card order, so the
 * output is stable rather than depending on which directories happen to exist.
 */
export const SOURCES: ReadonlyArray<Source> = [claudeCode];

/**
 * Sources whose data is actually on this machine.
 *
 * Detect, don't ask: someone with two agents installed should get both without
 * a flag, and someone with one should see no mention of the others.
 */
export function detectSources(home: string): Source[] {
  return SOURCES.filter((s) => s.root(home) !== null);
}

/** Resolve --source into a source list, or an error naming the valid ids. */
export function selectSources(home: string, id?: string): { sources: Source[]; error?: string } {
  if (id === undefined) return { sources: detectSources(home) };
  const match = SOURCES.find((s) => s.id === id);
  if (!match) {
    return {
      sources: [],
      error: `Unknown --source "${id}".\nAvailable: ${SOURCES.map((s) => s.id).join(', ')}`,
    };
  }
  return { sources: [match] };
}
