import { Dexie, type EntityTable } from "dexie";

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

export async function savePhoto(photo: Omit<StoredPhoto, "id">): Promise<number> {
  return db.photos.add(photo);
}

export async function deletePhoto(id: number): Promise<void> {
  await db.photos.delete(id);
}
