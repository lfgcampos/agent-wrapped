/**
 * Parse a --since value into a cutoff date.
 *
 * Accepts a relative window (`30d`, `12w`, `6m`) or an ISO date (`2026-08-01`).
 * Returns null when the value is not understood (a zero-length window or an
 * impossible calendar date counts), so the caller can complain rather than
 * silently analysing everything.
 */
export function parseSince(value: string, now: Date = new Date()): Date | null {
  const relative = value.trim().match(/^(\d+)\s*([dwm])$/i);
  if (relative) {
    const n = Number(relative[1]);
    if (n === 0) return null;
    const unit = relative[2]!.toLowerCase();
    const days = unit === 'd' ? n : unit === 'w' ? n * 7 : n * 30;
    return new Date(now.getTime() - days * 86_400_000);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split('-').map(Number) as [number, number, number];
    const d = new Date(year, month - 1, day);
    // Engines roll an impossible date (2026-02-31) forward, so check it came back unchanged.
    const unchanged = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    return unchanged ? d : null;
  }
  return null;
}
