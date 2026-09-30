/**
 * Product reports are exported over whatever date range someone picked in
 * Silom, so the imports overlap: "1–24 Aug", "27 May – 26 Aug" and
 * "1 Aug – 10 Sep" all describe August. Adding them together counts August
 * three times.
 *
 * The rule here: take the newest import first, then keep adding older ones
 * only where they cover ground the newer ones don't. Two imports that sit
 * side by side (May, then August) still both count — only genuine duplicates
 * are dropped.
 */

export type Window = {
  key: string;
  start: string;
  end: string;
  importedAt: string;
};

const overlaps = (a: Window, b: Window) => a.start <= b.end && b.start <= a.end;

/** The set of import windows to trust, newest first, without double counting. */
export function pickNonOverlappingWindows<T extends Window>(windows: T[]): T[] {
  // Newest import wins. Where two were imported at the same moment, the one
  // covering the longer span is the more complete picture.
  const sorted = [...windows].sort(
    (a, b) =>
      b.importedAt.localeCompare(a.importedAt) ||
      b.end.localeCompare(a.end) ||
      a.start.localeCompare(b.start)
  );

  const kept: T[] = [];
  for (const w of sorted) {
    if (!kept.some((k) => overlaps(k, w))) kept.push(w);
  }
  return kept;
}

/** Human-readable note about what was left out, or null when nothing was. */
export function skippedNote(windows: Window[]): string | null {
  const kept = pickNonOverlappingWindows(windows);
  const dropped = windows.filter((w) => !kept.some((k) => k.key === w.key));
  if (dropped.length === 0) return null;
  return `${dropped.length} older import${dropped.length === 1 ? "" : "s"} covering the same dates ${dropped.length === 1 ? "was" : "were"} left out, so nothing is counted twice.`;
}
