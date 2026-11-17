import type { Device, Level, Wall } from "./db";
import type { Homography, Point } from "./homography";

/** Rotates a point around the plane origin (y grows downwards, positive angle = clockwise on screen). */
export function rotatePoint(p: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

/** R · H: the same photo mapping followed by a rotation of the wall plane. */
export function rotateHomography(h: Homography, angle: number): Homography {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c * h[0] - s * h[3],
    c * h[1] - s * h[4],
    c * h[2] - s * h[5],
    s * h[0] + c * h[3],
    s * h[1] + c * h[4],
    s * h[2] + c * h[5],
    h[6],
    h[7],
    h[8],
  ];
}

/** Angle of a line against the horizontal, folded into (−90°, 90°] (direction of drawing does not matter). */
export function lineAngle(a: Point, b: Point): number {
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return angle;
}

/** Steepest line we still accept as "meant to be horizontal". */
export const MAX_LEVEL_ANGLE = (30 * Math.PI) / 180;

/**
 * The floor edge of an outline = the lowest edge that is roughly horizontal (within 30°).
 * Returns its two points, or null if the outline has no such edge.
 */
export function floorEdge(outline: readonly Point[]): [Point, Point] | null {
  let best: [Point, Point] | null = null;
  let bestY = -Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    if (Math.abs(lineAngle(a, b)) > MAX_LEVEL_ANGLE) continue;
    const y = (a.y + b.y) / 2;
    if (y > bestY) {
      bestY = y;
      best = [a, b];
    }
  }
  return best;
}

/** Wall geometry with the levelling correction applied (devices are stored in this corrected frame). */
export function effectiveWall(wall: Pick<Wall, "outline" | "homography" | "level">): { outline: Point[]; homography: Homography; angle: number } {
  const angle = wall.level?.angle ?? 0;
  if (angle === 0) return { outline: [...wall.outline], homography: wall.homography, angle };
  return { outline: wall.outline.map((p) => rotatePoint(p, angle)), homography: rotateHomography(wall.homography, angle), angle };
}

/** Moves devices along when the correction changes, so they stay on the same spot of the real wall. */
export function rotateDevices(devices: readonly Device[], delta: number): Device[] {
  if (delta === 0) return [...devices];
  return devices.map((d) => {
    const c = rotatePoint({ x: d.x + d.w / 2, y: d.y + d.h / 2 }, delta);
    return { ...d, x: Math.round(c.x - d.w / 2), y: Math.round(c.y - d.h / 2) };
  });
}

/** Correction angle for a chosen levelling mode; `line` is in the uncorrected wall frame. */
export function levelFor(mode: Level["mode"], outline: readonly Point[], line?: [Point, Point]): Level | null {
  if (mode === "target") return { mode, angle: 0 };
  const ref = mode === "floor" ? floorEdge(outline) : line;
  if (!ref) return null;
  const tilt = lineAngle(ref[0], ref[1]);
  if (Math.abs(tilt) > MAX_LEVEL_ANGLE) return null;
  return { mode, angle: -tilt, ...(mode === "line" ? { line: ref } : {}) };
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function bounds(points: readonly Point[]): Box {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** Even-odd test whether a point lies inside a polygon. */
export function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from `from` along the unit direction `dir` to the nearest polygon edge (Infinity if none). */
export function rayToPolygon(from: Point, dir: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / den;
    const s = ((a.x - from.x) * dir.y - (a.y - from.y) * dir.x) / den;
    if (t >= -1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = Math.max(0, t);
  }
  return best;
}

export function corners(d: Pick<Device, "x" | "y" | "w" | "h">): Point[] {
  return [
    { x: d.x, y: d.y },
    { x: d.x + d.w, y: d.y },
    { x: d.x + d.w, y: d.y + d.h },
    { x: d.x, y: d.y + d.h },
  ];
}

export function overlaps(a: Device, b: Device): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Device fits on the wall: all corners inside the outline and no wall edge crosses it. */
export function fitsOnWall(d: Device, outline: readonly Point[]): boolean {
  const c = corners(d);
  if (!c.every((p) => insidePolygon(p, outline))) return false;
  // A concave wall corner could still poke into the device.
  return !outline.some((p) => p.x > d.x && p.x < d.x + d.w && p.y > d.y && p.y < d.y + d.h);
}

/** Problems of one device on the wall (for highlighting). */
export function deviceProblem(d: Device, wall: { outline: readonly Point[]; devices: readonly Device[] }): "outside" | "overlap" | null {
  if (!fitsOnWall(d, wall.outline)) return "outside";
  if (wall.devices.some((o) => o.id !== d.id && overlaps(d, o))) return "overlap";
  return null;
}

export type DimensionLine = { from: Point; to: Point; mm: number; to_: "wall" | "device"; side: "left" | "right" | "up" | "down" };

const DIRECTIONS = [
  { side: "left", dir: { x: -1, y: 0 } },
  { side: "right", dir: { x: 1, y: 0 } },
  { side: "up", dir: { x: 0, y: -1 } },
  { side: "down", dir: { x: 0, y: 1 } },
] as const;

/**
 * Dimensions of the selected device in all 4 directions: to the nearest neighbouring device in that direction
 * (if any lies in the way) or else to the wall edge. Measured from the middle of the device side.
 */
export function deviceDimensions(d: Device, wall: { outline: readonly Point[]; devices: readonly Device[] }): DimensionLine[] {
  const lines: DimensionLine[] = [];
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  for (const { side, dir } of DIRECTIONS) {
    const start: Point =
      side === "left" ? { x: d.x, y: cy } : side === "right" ? { x: d.x + d.w, y: cy } : side === "up" ? { x: cx, y: d.y } : { x: cx, y: d.y + d.h };

    let best = rayToPolygon(start, dir, wall.outline);
    let kind: DimensionLine["to_"] = "wall";
    let anchor = start;
    for (const o of wall.devices) {
      if (o.id === d.id || overlaps(d, o)) continue;
      const horizontal = dir.y === 0;
      const sharesBand = horizontal ? o.y < d.y + d.h && d.y < o.y + o.h : o.x < d.x + d.w && d.x < o.x + o.w;
      if (!sharesBand) continue;
      const gap = side === "left" ? d.x - (o.x + o.w) : side === "right" ? o.x - (d.x + d.w) : side === "up" ? d.y - (o.y + o.h) : o.y - (d.y + d.h);
      if (gap < 0 || gap >= best) continue;
      best = gap;
      kind = "device";
      // Draw the line in the middle of the overlapping band, so it hits both devices.
      if (horizontal) {
        const band = (Math.max(o.y, d.y) + Math.min(o.y + o.h, d.y + d.h)) / 2;
        anchor = { x: start.x, y: band };
      } else {
        const band = (Math.max(o.x, d.x) + Math.min(o.x + o.w, d.x + d.w)) / 2;
        anchor = { x: band, y: start.y };
      }
    }
    if (!Number.isFinite(best)) continue;
    if (kind === "wall") anchor = start;
    lines.push({ from: anchor, to: { x: anchor.x + dir.x * best, y: anchor.y + dir.y * best }, mm: best, to_: kind, side });
  }
  return lines;
}

/** Typical devices for quick adding (mm). */
export const PRESETS = [
  { name: "Zásuvka", w: 80, h: 80 },
  { name: "Vypínač", w: 80, h: 80 },
  { name: "Rozvaděč", w: 600, h: 800 },
  { name: "Datový rozvaděč", w: 600, h: 600 },
  { name: "Střídač", w: 500, h: 400 },
  { name: "Baterie", w: 600, h: 1000 },
  { name: "Wallbox", w: 300, h: 400 },
  { name: "Elektroměr", w: 200, h: 300 },
] as const;
