import { db, notifyChange, type StoredPhoto } from "./db";
import { detectMarkers, type DetectedMarker } from "./detect";
import { distance, homographyFrom4, type Homography } from "./homography";
import { TARGET } from "./markers";
import type { Quality } from "./protocol";

/** Bump when detection or evaluation changes, so stored photos are analysed again. */
export const ANALYSIS_VERSION = 1;

export type { Quality };

export type Analysis = {
  version: number;
  quality: Quality;
  message: string;
  markers: DetectedMarker[];
  /** Marker used for measuring (the biggest one). */
  primaryId: number | null;
};

/** Target side on the photo below this many pixels is too imprecise to measure from. */
const MIN_SIDE_PX = 120;
/** Ratio of opposite target edges below this = photo taken too much from the side. */
const MIN_EDGE_RATIO = 0.6;

function edges(m: DetectedMarker): number[] {
  return m.corners.map((p, i) => distance(p, m.corners[(i + 1) % 4]));
}

export function markerSidePx(m: DetectedMarker): number {
  return edges(m).reduce((a, b) => a + b, 0) / 4;
}

function edgeRatio(m: DetectedMarker): number {
  const [a, b, c, d] = edges(m);
  return Math.min(Math.min(a, c) / Math.max(a, c), Math.min(b, d) / Math.max(b, d));
}

export function qualityMessage(quality: Quality, markerId: number | null): string {
  switch (quality) {
    case "ok":
      return `Terč č. ${markerId} nalezen – fotka je použitelná`;
    case "small":
      return `Terč č. ${markerId} je na fotce moc malý – přibliž se`;
    case "skewed":
      return `Terč č. ${markerId} je moc z boku – vyfoť víc zepředu`;
    case "missing":
      return "Terč nenalezen – musí být celý vidět, ostrý a bez odlesků";
    case "error":
      return "Fotku se nepodařilo zpracovat";
  }
}

/** Decides whether a photo is usable for measuring. */
export function evaluate(markers: DetectedMarker[]): Analysis {
  // Only numbers we print (0 is never used on a target).
  const valid = markers.filter((m) => m.id >= 1 && m.id <= TARGET.maxNumber);
  if (valid.length === 0) return { version: ANALYSIS_VERSION, quality: "missing", message: qualityMessage("missing", null), markers: [], primaryId: null };
  const primary = valid.reduce((best, m) => (markerSidePx(m) > markerSidePx(best) ? m : best));
  const quality: Quality = markerSidePx(primary) < MIN_SIDE_PX ? "small" : edgeRatio(primary) < MIN_EDGE_RATIO ? "skewed" : "ok";
  return { version: ANALYSIS_VERSION, quality, message: qualityMessage(quality, primary.id), markers: valid, primaryId: primary.id };
}

/** Photo pixels → millimetres on the target plane (origin = top-left corner of the black square). */
export function planeHomography(analysis: Analysis): Homography | null {
  const marker = analysis.markers.find((m) => m.id === analysis.primaryId);
  if (!marker) return null;
  const s = TARGET.sideMm;
  return homographyFrom4(marker.corners, [
    { x: 0, y: 0 },
    { x: s, y: 0 },
    { x: s, y: s },
    { x: 0, y: s },
  ]);
}

export function isUsable(photo: Pick<StoredPhoto, "analysis">): boolean {
  return photo.analysis?.quality === "ok";
}

export function needsAnalysis(photo: StoredPhoto): boolean {
  return photo.analysis?.version !== ANALYSIS_VERSION;
}

let chain: Promise<unknown> = Promise.resolve();

/** Analyses one stored photo (one at a time, detection is heavy) and saves the result. */
export function analysePhoto(id: number): Promise<Analysis> {
  const run = chain.then(async () => {
    const photo = await db.photos.get(id);
    if (!photo) throw new Error("Photo not found");
    let analysis: Analysis;
    try {
      analysis = evaluate((await detectMarkers(photo.blob)).markers);
    } catch {
      analysis = { version: ANALYSIS_VERSION, quality: "error", message: qualityMessage("error", null), markers: [], primaryId: null };
    }
    await db.photos.update(id, { analysis });
    notifyChange();
    return analysis;
  });
  chain = run.catch(() => undefined);
  return run;
}
