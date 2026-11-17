import { Dexie, type EntityTable } from "dexie";
import type { Analysis } from "./analysis";
import type { Point } from "./homography";

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

export const db = new Dexie("2m-mereni") as Dexie & {
  photos: EntityTable<StoredPhoto, "id">;
};

db.version(1).stores({
  photos: "++id, receivedAt",
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
