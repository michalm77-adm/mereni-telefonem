import { ALLOWED_MIME } from "./protocol";

/** Longest side of a converted photo; enough detail for measuring from targets. */
const MAX_SIDE = 4096;
/** Photos up to this size in an allowed format are sent untouched (keeps full quality and EXIF). */
const SEND_AS_IS_BYTES = 15 * 1024 * 1024;

export class ImageError extends Error {}

/** Detects the real image type from the first bytes (never trust the file name or declared type). */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Phone side: returns a photo the PC accepts. Big files and other formats (e.g. iPhone HEIC)
 * are re-encoded to JPEG; small JPEG/PNG/WebP files go as they are.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; mime: string; name: string }> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const realMime = sniffImageMime(head);
  if (realMime && (ALLOWED_MIME as readonly string[]).includes(realMime) && file.size <= SEND_AS_IS_BYTES) {
    return { blob: file, mime: realMime, name: file.name };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("Tento soubor není fotka, kterou umím otevřít. Vyber fotku ve formátu JPG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new ImageError("Fotku se nepodařilo připravit k odeslání.");
  return { blob, mime: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

/** PC side: checks the received bytes really are a decodable image and reads its size. */
export async function inspectPhoto(blob: Blob, declaredMime: string): Promise<{ width: number; height: number }> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (sniffImageMime(head) !== declaredMime) throw new ImageError("Soubor není fotka.");
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    throw new ImageError("Fotka je poškozená.");
  }
}
