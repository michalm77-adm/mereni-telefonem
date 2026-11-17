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
};

/** A device placed on a wall; x/y = top-left corner in mm (wall plane coordinates, y grows downwards). */
export type Device = { id: string; name: string; x: number; y: number; w: number; h: number };

/** A flat surface (wall) outlined on a photo, with devices laid out on it. */
export type Wall = {
  id: number;
  name: string;
  photoId: number;
  /** Photo pixels → mm on the wall plane (kept with the wall, so it never changes under the layout). */
  homography: Homography;
  /** Wall outline in mm, in drawing order. */
  outline: Point[];
  devices: Device[];
  createdAt: Date;
  updatedAt: Date;
};

export const db = new Dexie("2m-mereni") as Dexie & {
  photos: EntityTable<StoredPhoto, "id">;
  walls: EntityTable<Wall, "id">;
};

db.version(1).stores({
  photos: "++id, receivedAt",
});
db.version(2).stores({
  photos: "++id, receivedAt",
  walls: "++id, photoId, createdAt",
});

export async function listPhotos(): Promise<StoredPhoto[]> {
  return db.photos.orderBy("receivedAt").toArray();
}

export async function getPhoto(id: number): Promise<StoredPhoto | undefined> {
  return db.photos.get(id);
}

export async function savePhoto(photo: Omit<StoredPhoto, "id">): Promise<number> {
  return db.photos.add(photo);
}

export async function saveDimensions(id: number, dims: Dimension[]): Promise<void> {
  await db.photos.update(id, { dims });
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
  return db.walls.add({ ...wall, createdAt: now, updatedAt: now });
}

export async function updateWall(id: number, changes: Partial<Pick<Wall, "name" | "devices">>): Promise<void> {
  await db.walls.update(id, { ...changes, updatedAt: new Date() });
}

export async function deleteWall(id: number): Promise<void> {
  await db.walls.delete(id);
}
