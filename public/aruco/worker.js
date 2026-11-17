/* Marker detection worker (classic worker: js-aruco2 registers globals on `this`). */
/* global AR */
importScripts("cv.js", "aruco.js");

// Accept at most 3 wrong bits out of 36 (dictionary guarantees >= 12 between any two markers).
var detector = new AR.Detector({ dictionaryName: "ARUCO_MIP_36h12", maxHammingDistance: 4 });

// Detect on downscaled copies: large first (small/distant targets), then smaller (big/close targets, less noise).
var SCALES = [2400, 1200];

self.onmessage = async function (event) {
  var job = event.data;
  try {
    var bitmap = await createImageBitmap(job.blob);
    var width = bitmap.width;
    var height = bitmap.height;
    var found = new Map();

    for (var s = 0; s < SCALES.length; s++) {
      var scale = Math.min(1, SCALES[s] / Math.max(width, height));
      var w = Math.round(width * scale);
      var h = Math.round(height * scale);
      var canvas = new OffscreenCanvas(w, h);
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, w, h);
      var markers = detector.detect(ctx.getImageData(0, 0, w, h));
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (found.has(m.id)) continue;
        found.set(m.id, {
          id: m.id,
          corners: m.corners.map(function (p) {
            return { x: p.x / scale, y: p.y / scale };
          }),
        });
      }
      if (found.size > 0) break;
    }
    bitmap.close();
    self.postMessage({ jobId: job.jobId, ok: true, width: width, height: height, markers: Array.from(found.values()) });
  } catch (err) {
    self.postMessage({ jobId: job.jobId, ok: false, error: String(err) });
  }
};
