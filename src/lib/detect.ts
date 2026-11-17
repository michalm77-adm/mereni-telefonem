import type { Point } from "./homography";

export type DetectedMarker = { id: number; corners: Point[] };
export type Detection = { width: number; height: number; markers: DetectedMarker[] };

type WorkerReply = { jobId: number; ok: true; width: number; height: number; markers: DetectedMarker[] } | { jobId: number; ok: false; error: string };

let worker: Worker | null = null;
let nextJob = 1;
const pending = new Map<number, { resolve: (d: Detection) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  // Served from public/ next to the page, so it works on GitHub Pages under /<repo>/ too.
  worker = new Worker(new URL("aruco/worker.js", document.baseURI));
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const job = pending.get(reply.jobId);
    if (!job) return;
    pending.delete(reply.jobId);
    if (reply.ok) job.resolve({ width: reply.width, height: reply.height, markers: reply.markers });
    else job.reject(new Error(reply.error));
  };
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error("Detection worker failed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Finds measuring targets (ArUco markers) in a photo. Corners are in original photo pixels. */
export function detectMarkers(blob: Blob): Promise<Detection> {
  return new Promise((resolve, reject) => {
    const jobId = nextJob++;
    pending.set(jobId, { resolve, reject });
    getWorker().postMessage({ jobId, blob });
  });
}
