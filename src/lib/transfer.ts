import type { DataConnection } from "peerjs";
import { CHUNK_BYTES, MAX_PHOTO_BYTES, toArrayBuffer, type PcMessage, type PhoneMessage } from "./protocol";
import { ImageError, inspectPhoto } from "./image";

/** Pause sending while this much data waits in the channel (keeps memory low on phones). */
const MAX_BUFFERED_BYTES = 1024 * 1024;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Bytes waiting in the WebRTC channel plus messages PeerJS still holds back (binary connections only). */
function pendingBytes(conn: DataConnection): number {
  const held = "bufferSize" in conn && typeof conn.bufferSize === "number" ? conn.bufferSize : 0;
  return (conn.dataChannel?.bufferedAmount ?? 0) + held * CHUNK_BYTES;
}

/** Phone side: sends one photo in chunks; onProgress gets 0..1. Throws if the connection closes. */
export async function sendPhoto(
  conn: DataConnection,
  photo: { id: string; blob: Blob; mime: string; name: string },
  onProgress: (fraction: number) => void,
): Promise<void> {
  const send = (msg: PhoneMessage) => {
    if (!conn.open) throw new Error("closed");
    void conn.send(msg);
  };
  const { id, blob } = photo;
  send({ type: "photo-start", id, name: photo.name.slice(0, 200), mime: photo.mime, size: blob.size });

  const total = Math.ceil(blob.size / CHUNK_BYTES);
  for (let index = 0; index < total; index++) {
    while (pendingBytes(conn) > MAX_BUFFERED_BYTES) {
      if (!conn.open) throw new Error("closed");
      await sleep(15);
    }
    const data = await blob.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer();
    send({ type: "photo-chunk", id, index, data });
    onProgress((index + 1) / total);
  }
  send({ type: "photo-end", id, chunks: total });
}

type Incoming = { id: string; name: string; mime: string; size: number; parts: ArrayBuffer[]; received: number };

export type ReceivedPhoto = { name: string; mime: string; size: number; width: number; height: number; blob: Blob };

/**
 * PC side: assembles photos from one phone connection, validates them and answers with photo-ack.
 * Only one photo per phone is in flight at a time.
 */
export class PhotoReceiver {
  private current: Incoming | null = null;

  constructor(
    private readonly conn: DataConnection,
    private readonly onPhoto: (photo: ReceivedPhoto) => Promise<void>,
  ) {}

  handle(msg: PhoneMessage): void {
    switch (msg.type) {
      case "photo-start":
        if (this.current) this.reject(this.current.id, "Předchozí fotka nebyla dokončena.");
        this.current = { id: msg.id, name: msg.name, mime: msg.mime, size: msg.size, parts: [], received: 0 };
        return;
      case "photo-chunk": {
        const cur = this.current;
        if (!cur || cur.id !== msg.id) return;
        const data = toArrayBuffer(msg.data)!;
        if (msg.index !== cur.parts.length || cur.received + data.byteLength > Math.min(cur.size, MAX_PHOTO_BYTES)) {
          this.current = null;
          this.reject(msg.id, "Fotka dorazila poškozená.");
          return;
        }
        cur.parts.push(data);
        cur.received += data.byteLength;
        return;
      }
      case "photo-end": {
        const cur = this.current;
        if (!cur || cur.id !== msg.id) return;
        this.current = null;
        if (cur.received !== cur.size || cur.parts.length !== msg.chunks) {
          this.reject(cur.id, "Fotka dorazila neúplná.");
          return;
        }
        void this.finish(cur);
        return;
      }
      default:
        return;
    }
  }

  private async finish(cur: Incoming): Promise<void> {
    const blob = new Blob(cur.parts, { type: cur.mime });
    try {
      const { width, height } = await inspectPhoto(blob, cur.mime);
      await this.onPhoto({ name: cur.name, mime: cur.mime, size: cur.size, width, height, blob });
      this.reply({ type: "photo-ack", id: cur.id, ok: true });
    } catch (err) {
      this.reject(cur.id, err instanceof ImageError ? err.message : "Fotku se nepodařilo uložit.");
    }
  }

  private reject(id: string, reason: string): void {
    this.reply({ type: "photo-ack", id, ok: false, reason });
  }

  private reply(msg: PcMessage): void {
    if (this.conn.open) void this.conn.send(msg);
  }
}
