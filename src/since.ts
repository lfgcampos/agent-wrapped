/**
 * Parse a --since value into a cutoff date.
 *
 * Accepts a relative window (`30d`, `12w`, `6m`) or an ISO date (`2026-08-01`).
 * Returns null when the value is not understood, so the caller can complain
 * rather than silently analysing everything.
 */
export function parseSince(value: string, now: Date = new Date()): Date | null {
  const relative = value.trim().match(/^(\d+)\s*([dwm])$/i);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2]!.toLowerCase();
    const days = unit === 'd' ? n : unit === 'w' ? n * 7 : n * 30;
    return new Date(now.getTime() - days * 86_400_000);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const d = new Date(`${value.trim()}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
