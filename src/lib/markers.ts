import { ARUCO_MIP_36H12 } from "./aruco-dictionary";

/** Printed target geometry (mm). Detection later relies on exactly these numbers. */
export const TARGET = {
  dictionary: "ARUCO_MIP_36h12",
  /** Side of the black square = 6 data cells + 1 black border cell on each side. */
  sideMm: 180,
  cells: 8,
  dataCells: 6,
  /** Highest usable target number (dictionary has ids 0–249; number = id, 0 is not used). */
  maxNumber: ARUCO_MIP_36H12.length - 1,
} as const;

/** 6×6 data cells of a marker, row by row; true = white cell. */
export function markerBits(id: number): boolean[][] {
  const code = ARUCO_MIP_36H12[id];
  if (code === undefined) throw new RangeError(`Marker id ${id} is out of range`);
  const bits = code.toString(2).padStart(TARGET.dataCells ** 2, "0");
  return Array.from({ length: TARGET.dataCells }, (_, y) =>
    Array.from({ length: TARGET.dataCells }, (_, x) => bits[y * TARGET.dataCells + x] === "1"),
  );
}
