export type Route =
  | { page: "desk" }
  | { page: "targets" }
  | { page: "measure"; photoId: number }
  | { page: "send"; pcId: string | null };

const PC_ID_PATTERN = /^[a-z0-9-]{8,64}$/;

export function parseRoute(hash: string): Route {
  if (hash === "#/terce") return { page: "targets" };
  const photo = /^#\/foto\/(\d{1,9})$/.exec(hash);
  if (photo) return { page: "measure", photoId: Number(photo[1]) };
  if (!hash.startsWith("#/send")) return { page: "desk" };
  const query = hash.split("?")[1] ?? "";
  const pcId = new URLSearchParams(query).get("pc");
  return { page: "send", pcId: pcId && PC_ID_PATTERN.test(pcId) ? pcId : null };
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Base address of the app as the phone can reach it. */
export function appBaseUrl(): string {
  const { hostname, origin, pathname } = window.location;
  const lanUrl = import.meta.env.VITE_LAN_URL;
  if (isLocalHost(hostname) && lanUrl) return lanUrl.endsWith("/") ? lanUrl : `${lanUrl}/`;
  return origin + pathname;
}

/** True when the QR would point to "localhost", which a phone cannot open. */
export function phoneCannotReach(): boolean {
  return isLocalHost(new URL(appBaseUrl()).hostname);
}

export function senderUrl(pcId: string): string {
  return `${appBaseUrl()}#/send?pc=${encodeURIComponent(pcId)}`;
}
