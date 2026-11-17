/** Messages exchanged between the phone and the PC over the WebRTC data channel. */
export type PhoneMessage =
  | { type: "hello"; device: string; deviceId: string }
  | { type: "ping" }
  | { type: "photo-start"; id: string; name: string; mime: string; size: number }
  | { type: "photo-chunk"; id: string; index: number; data: ArrayBuffer }
  | { type: "photo-end"; id: string; chunks: number };

export type PcMessage =
  | { type: "waiting" }
  | { type: "welcome" }
  | { type: "rejected" }
  | { type: "photo-ack"; id: string; ok: true }
  | { type: "photo-ack"; id: string; ok: false; reason: string };

/** Phone sends a ping this often; the PC drops a phone that has been silent for PHONE_TIMEOUT_MS. */
export const PING_INTERVAL_MS = 3000;
export const PHONE_TIMEOUT_MS = 10000;

/** Photo transfer limits. */
export const CHUNK_BYTES = 16 * 1024;
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

const ID_PATTERN = /^[a-z0-9-]{4,64}$/;

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/** Binary payload as it arrives from PeerJS (ArrayBuffer or a typed array view). */
export function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return view.slice().buffer;
  }
  return null;
}

/** Strict validation of everything the PC receives from a phone. */
export function isPhoneMessage(data: unknown): data is PhoneMessage {
  if (!isRecord(data)) return false;
  switch (data.type) {
    case "ping":
      return true;
    case "hello":
      return typeof data.device === "string" && data.device.length <= 60 && isId(data.deviceId);
    case "photo-start":
      return (
        isId(data.id) &&
        typeof data.name === "string" &&
        data.name.length <= 200 &&
        typeof data.mime === "string" &&
        (ALLOWED_MIME as readonly string[]).includes(data.mime) &&
        isCount(data.size, MAX_PHOTO_BYTES) &&
        data.size > 0
      );
    case "photo-chunk":
      return isId(data.id) && isCount(data.index, MAX_PHOTO_BYTES) && toArrayBuffer(data.data) !== null;
    case "photo-end":
      return isId(data.id) && isCount(data.chunks, MAX_PHOTO_BYTES);
    default:
      return false;
  }
}

export function isPcMessage(data: unknown): data is PcMessage {
  if (!isRecord(data)) return false;
  if (data.type === "waiting" || data.type === "welcome" || data.type === "rejected") return true;
  return data.type === "photo-ack" && isId(data.id) && typeof data.ok === "boolean";
}

/** Short human name of the phone from its user agent. */
export function deviceName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android telefon";
  return "Zařízení";
}
