import { Dexie, type EntityTable } from "dexie";
import type { Analysis } from "./analysis";
import type { Homography, Point } from "./homography";

/** One dimension line drawn on a photo; points are in original photo pixels. */
export type Dimension = { id: string; a: Point; b: Point };

/** A photo received from a phone, stored only in this browser (IndexedDB). */
export type StoredPhoto = {
  id: number;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  device: string;
  receivedAt: Date;
  blob: Blob;
  /** Target detection result (missing until analysed). */
  analysis?: Analysis;
  /** Dimensions the user measured on this photo. */
  dims?: Dimension[];
  /** Job ("zakázka") the photo belongs to = subfolder in the save folder. */
  job?: string;
  /** File name already written to the save folder (missing = not saved yet). */
  savedAs?: string;
};

/** Small key/value store (e.g. the chosen save folder handle). */
export type Setting = { key: string; value: unknown };

/** A device placed on a wall; x/y = top-left corner in mm (wall plane coordinates, y grows downwards). */
export type Device = { id: string; name: string; x: number; y: number; w: number; h: number };

/**
 * How the wall is levelled: by the target as it hangs, by the floor edge of the outline, or by a line the user drew
 * on something horizontal. `angle` (radians) rotates the uncorrected wall plane; `line` is in uncorrected mm.
 */
export type Level = { mode: "target" | "floor" | "line"; angle: number; line?: [Point, Point] };

/** A flat surface (wall) outlined on a photo, with devices laid out on it. */
export type Wall = {
  id: number;
  name: string;
  photoId: number;
  /** Photo pixels → mm on the wall plane (kept with the wall, so it never changes under the layout). */
  homography: Homography;
  /** Wall outline in mm, in drawing order. */
  outline: Point[];
  /** Devices in the levelled frame (see `level`). */
  devices: Device[];
  /** Missing = the user has not answered the "is the floor level?" question yet. */
  level?: Level;
  createdAt: Date;
  updatedAt: Date;
};

export const db = new Dexie("2m-mereni") as Dexie & {
  photos: EntityTable<StoredPhoto, "id">;
  walls: EntityTable<Wall, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  photos: "++id, receivedAt",
});
db.version(2).stores({
  photos: "++id, receivedAt",
  walls: "++id, photoId, createdAt",
});
db.version(3).stores({
  photos: "++id, receivedAt",
  walls: "++id, photoId, createdAt",
  settings: "key",
});

export async function listPhotos(): Promise<StoredPhoto[]> {
  return db.photos.orderBy("receivedAt").toArray();
}

export async function getPhoto(id: number): Promise<StoredPhoto | undefined> {
  return db.photos.get(id);
}

export async function savePhoto(photo: Omit<StoredPhoto, "id">): Promise<number> {
  const id = await db.photos.add(photo);
  notifyChange();
  return id;
}

export async function saveDimensions(id: number, dims: Dimension[]): Promise<void> {
  await db.photos.update(id, { dims });
  notifyChange();
}

let changeListener: (() => void) | null = null;

/** Called after every data change (used to save to the PC folder). */
export function onDataChange(listener: () => void): void {
  changeListener = listener;
}

export function notifyChange(): void {
  changeListener?.();
}

export async function deletePhoto(id: number): Promise<void> {
  await db.photos.delete(id);
}

export async function listWalls(): Promise<Wall[]> {
  return db.walls.orderBy("createdAt").toArray();
}

export async function getWall(id: number): Promise<Wall | undefined> {
  return db.walls.get(id);
}

export async function createWall(wall: Omit<Wall, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = new Date();
  const id = await db.walls.add({ ...wall, createdAt: now, updatedAt: now });
  notifyChange();
  return id;
}

export async function updateWall(id: number, changes: Partial<Pick<Wall, "name" | "devices" | "level">>): Promise<void> {
  await db.walls.update(id, { ...changes, updatedAt: new Date() });
  notifyChange();
}

export async function deleteWall(id: number): Promise<void> {
  await db.walls.delete(id);
}
