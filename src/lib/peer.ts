import type { PeerOptions } from "peerjs";

/** Connection settings for the PeerJS signalling server. */
export function peerOptions(): PeerOptions {
  if (import.meta.env.VITE_PEER_MODE === "local") {
    const secure = window.location.protocol === "https:";
    return {
      host: window.location.hostname,
      port: Number(window.location.port) || (secure ? 443 : 80),
      path: "/peerjs",
      secure,
      debug: 1,
    };
  }
  return { debug: 1 };
}

/** Random, URL-safe id. Uses getRandomValues (also works on plain http on the LAN). */
export function randomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const PC_ID_PREFIX = "2m-mereni-pc-";
export const PHONE_ID_PREFIX = "2m-mereni-tel-";
