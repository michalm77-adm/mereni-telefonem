import { db, type StoredPhoto, type Wall } from "./db";
import { planeHomography } from "./analysis";
import { applyHomography, distance } from "./homography";
import { bounds, effectiveWall } from "./layout";

/**
 * Saving to a folder on the PC (File System Access API, Chrome/Edge only).
 * The chosen folder handle is kept in IndexedDB; each job ("zakázka") gets its own subfolder with
 * the photos as normal image files and JSON files with dimensions and wall layouts next to them.
 */

type Permission = "granted" | "denied" | "prompt";
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<Permission>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<Permission>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (o: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<DirHandle>;
  /** E2E hook (dev server only): use the browser's private file system instead of the folder picker. */
  __E2E_FOLDER__?: boolean;
};

export type FolderState =
  | { kind: "unsupported" }
  | { kind: "none" }
  | { kind: "needs-permission"; name: string }
  | { kind: "ready"; name: string; savedAt: Date | null; saving: boolean }
  | { kind: "error"; name: string; message: string };

const FOLDER_KEY = "folder";
const win = window as PickerWindow;

function testMode(): boolean {
  return import.meta.env.DEV && win.__E2E_FOLDER__ === true;
}

export function folderSupported(): boolean {
  return typeof win.showDirectoryPicker === "function" || testMode();
}

let state: FolderState = { kind: folderSupported() ? "none" : "unsupported" };
const listeners = new Set<(s: FolderState) => void>();

function setState(next: FolderState) {
  state = next;
  for (const l of listeners) l(state);
}

export function subscribeFolder(listener: (s: FolderState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

async function permission(handle: DirHandle, ask: boolean): Promise<Permission> {
  if (!handle.queryPermission) return "granted"; // private file system (tests) has no permission API
  const now = await handle.queryPermission({ mode: "readwrite" });
  if (now === "granted" || !ask || !handle.requestPermission) return now;
  return handle.requestPermission({ mode: "readwrite" });
}

async function storedHandle(): Promise<DirHandle | null> {
  const row = await db.settings.get(FOLDER_KEY);
  return (row?.value as DirHandle | undefined) ?? null;
}

/** On start: restore the folder chosen earlier (the browser may ask for permission again after a restart). */
export async function initFolder(): Promise<void> {
  if (!folderSupported()) return;
  const handle = await storedHandle().catch(() => null);
  if (!handle) return setState({ kind: "none" });
  const p = await permission(handle, false).catch(() => "denied" as Permission);
  setState(p === "granted" ? { kind: "ready", name: handle.name, savedAt: null, saving: false } : { kind: "needs-permission", name: handle.name });
  if (p === "granted") scheduleSync();
}

/** Lets the user choose the folder (must be called from a click). */
export async function chooseFolder(): Promise<void> {
  let handle: DirHandle;
  if (testMode()) {
    handle = (await navigator.storage.getDirectory()) as DirHandle;
  } else {
    try {
      handle = await win.showDirectoryPicker!({ id: "2m-mereni", mode: "readwrite", startIn: "documents" });
    } catch {
      return; // user closed the dialog
    }
  }
  await db.settings.put({ key: FOLDER_KEY, value: handle });
  // A newly chosen folder gets everything again.
  await db.photos.toCollection().modify((p) => {
    delete p.savedAs;
  });
  setState({ kind: "ready", name: handle.name, savedAt: null, saving: false });
  scheduleSync(0);
}

/** Re-grants access to the remembered folder (must be called from a click). */
export async function allowFolder(): Promise<void> {
  const handle = await storedHandle();
  if (!handle) return setState({ kind: "none" });
  const p = await permission(handle, true).catch(() => "denied" as Permission);
  if (p === "granted") {
    setState({ kind: "ready", name: handle.name, savedAt: null, saving: false });
    scheduleSync(0);
  }
}

export async function forgetFolder(): Promise<void> {
  await db.settings.delete(FOLDER_KEY);
  setState({ kind: "none" });
}

/** Safe file/folder name for Windows (no reserved characters, no trailing dots/spaces). */
export function safeName(name: string, fallback: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) || !clean ? fallback : clean;
}

export function photoFileName(photo: Pick<StoredPhoto, "id" | "name" | "mime">): string {
  const ext = photo.mime === "image/png" ? ".png" : photo.mime === "image/webp" ? ".webp" : ".jpg";
  const base = safeName(photo.name.replace(/\.[^.]+$/, ""), "foto");
  return `${String(photo.id).padStart(4, "0")}-${base}${ext}`;
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function photoJson(photo: StoredPhoto) {
  const h = photo.analysis ? planeHomography(photo.analysis) : null;
  return {
    app: "2M elektro – Měření telefonem",
    format: 1,
    photo: photoFileName(photo),
    received: photo.receivedAt.toISOString(),
    size_px: { width: photo.width, height: photo.height },
    target: photo.analysis ? { number: photo.analysis.primaryId, quality: photo.analysis.quality, note: photo.analysis.message } : null,
    dimensions_mm: (photo.dims ?? []).map((d, i) => ({
      no: i + 1,
      length: h ? round1(distance(applyHomography(h, d.a), applyHomography(h, d.b))) : null,
      a_px: d.a,
      b_px: d.b,
    })),
  };
}

function wallJson(wall: Wall, photo: StoredPhoto | undefined) {
  const geo = effectiveWall(wall);
  const box = bounds(geo.outline);
  return {
    app: "2M elektro – Měření telefonem",
    format: 1,
    name: wall.name,
    photo: photo ? photoFileName(photo) : null,
    size_mm: { width: round1(box.maxX - box.minX), height: round1(box.maxY - box.minY) },
    level: wall.level ? { by: wall.level.mode, correction_deg: round1((wall.level.angle * 180) / Math.PI) } : null,
    outline_mm: geo.outline.map((p) => ({ x: round1(p.x - box.minX), y: round1(box.maxY - p.y) })),
    devices: wall.devices.map((d) => ({
      name: d.name,
      width_mm: d.w,
      height_mm: d.h,
      from_left_mm: round1(d.x - box.minX),
      centre_above_floor_mm: round1(box.maxY - (d.y + d.h / 2)),
    })),
    homography: geo.homography,
  };
}

/** Writes new photos and all measurement/wall files of every job into the folder. */
async function syncAll(): Promise<void> {
  const handle = await storedHandle();
  if (!handle || (await permission(handle, false)) !== "granted") {
    if (handle) setState({ kind: "needs-permission", name: handle.name });
    return;
  }
  setState({ kind: "ready", name: handle.name, savedAt: state.kind === "ready" ? state.savedAt : null, saving: true });
  try {
    const photos = await db.photos.toArray();
    const walls = await db.walls.toArray();
    const dirs = new Map<string, FileSystemDirectoryHandle>();
    const jobDir = async (job: string | undefined) => {
      const name = safeName(job ?? "", "Bez zakázky");
      if (!dirs.has(name)) dirs.set(name, await handle.getDirectoryHandle(name, { create: true }));
      return dirs.get(name)!;
    };

    for (const photo of photos) {
      const dir = await jobDir(photo.job);
      const file = photoFileName(photo);
      if (photo.savedAs !== file) {
        await writeFile(dir, file, photo.blob);
        await db.photos.update(photo.id, { savedAs: file });
      }
      if (photo.analysis || photo.dims?.length) {
        await writeFile(dir, file.replace(/\.[^.]+$/, ".mereni.json"), JSON.stringify(photoJson(photo), null, 2));
      }
    }
    for (const wall of walls) {
      const photo = photos.find((p) => p.id === wall.photoId);
      const dir = await jobDir(photo?.job);
      await writeFile(dir, `plocha-${wall.id}-${safeName(wall.name, "plocha")}.json`, JSON.stringify(wallJson(wall, photo), null, 2));
    }
    setState({ kind: "ready", name: handle.name, savedAt: new Date(), saving: false });
  } catch (err) {
    setState({ kind: "error", name: handle.name, message: err instanceof Error ? err.message : String(err) });
  }
}

let timer: number | undefined;
let running: Promise<void> = Promise.resolve();

/** Saves to the folder shortly after changes (several quick changes = one save). */
export function scheduleSync(delayMs = 800): void {
  if (state.kind !== "ready" && state.kind !== "error") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    running = running.then(syncAll, syncAll);
  }, delayMs);
}

/** For tests and the "save now" button: waits until everything is written. */
export async function syncNow(): Promise<void> {
  window.clearTimeout(timer);
  running = running.then(syncAll, syncAll);
  await running;
}
