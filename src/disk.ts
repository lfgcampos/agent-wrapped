import type { Disk, Stats, TranscriptFile } from './types.js';

/**
 * Disk footprint of one source's transcripts.
 *
 * Divided by active days rather than by the elapsed span: the question the
 * retention advice answers is "how fast does this grow when you are working",
 * and idle days would flatten the rate into an underestimate.
 */
export function computeDisk(files: TranscriptFile[], stats: Stats): Disk {
  const bytesOnDisk = files.reduce((n, f) => n + f.size, 0);
  return {
    bytesOnDisk,
    bytesPerDay: stats.activeDays > 0 ? bytesOnDisk / stats.activeDays : 0,
  };
}
