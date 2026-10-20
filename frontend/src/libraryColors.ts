import type { LibraryOverview } from "./api";

/**
 * One colour per library wherever it is drawn (query 2026-1019 1458): the leader banner, the material
 * preview. Eight distinct hues is the most a reader separates, so the seven largest libraries get the
 * validated categorical slots in fixed order and the rest share a neutral “其他领域”. Checked with the
 * dataviz palette validator on the banner surface #1f3a57; magenta and green sit under 3:1 there, so
 * every use also names the library in text.
 *
 * Card B4: hues follow project count with ties broken by library id, so re-sorting a view or equal
 * counts never repaint a library. Binding hues to ids alphabetically was tried and rejected: it put the
 * palette's weakest pair (orange/yellow) on the two largest libraries.
 */
export const LIBRARY_HUES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
export const OTHER_LIBRARIES = "#8597ab";

/** Libraries from largest to smallest; the first seven own a hue each, the rest share OTHER_LIBRARIES. */
export function rankLibraries(rows: LibraryOverview[]): LibraryOverview[] {
  return [...rows].sort((a, b) => b.projects - a.projects || a.corpus_id.localeCompare(b.corpus_id));
}

export function libraryColor(rows: LibraryOverview[], corpusId: string): string {
  const index = rankLibraries(rows).findIndex((row) => row.corpus_id === corpusId);
  return index >= 0 && index < LIBRARY_HUES.length ? LIBRARY_HUES[index] : OTHER_LIBRARIES;
}
