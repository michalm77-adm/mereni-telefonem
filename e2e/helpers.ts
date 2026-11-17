import { expect, devices, type Browser, type Page } from "@playwright/test";

/** Opens the PC page and waits until it is ready for phones. */
export async function openPc(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByTestId("pc-status")).toHaveText(/čekám na telefon/, { timeout: 20_000 });
  const senderUrl = await page.getByTestId("qr").getAttribute("data-sender-url");
  return new URL(senderUrl!).hash;
}

/** Opens the sender link on an emulated phone (the QR points at the PC's Wi-Fi address, the test uses baseURL). */
export async function openPhone(browser: Browser, baseURL: string | undefined, hash: string) {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL });
  const phone = await context.newPage();
  await phone.goto(`/${hash}`);
  return { context, phone };
}

/** Full pairing: phone connects and the PC approves it. */
export async function pairPhone(browser: Browser, baseURL: string | undefined, pc: Page) {
  const hash = await openPc(pc);
  const result = await openPhone(browser, baseURL, hash);
  await expect(result.phone.getByTestId("phone-status")).toHaveText("Povol telefon na počítači");
  await pc.getByRole("button", { name: "Povolit" }).click();
  await expect(result.phone.getByTestId("phone-status")).toHaveText("Spojeno s počítačem");
  return result;
}

export type Pt = { x: number; y: number };
export type H = number[];

/** Homography mapping 4 points onto 4 points (same maths as the app, kept separate on purpose). */
export function homography(src: Pt[], dst: Pt[]): H {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 9; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [...a.map((row, i) => row[8] / row[i]), 1];
}

export function project(h: H, p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** Sheet corners in mm (A4) – a "photo" is defined by where these 4 corners land in the picture. */
export const SHEET_CORNERS: Pt[] = [
  { x: 0, y: 0 },
  { x: 210, y: 0 },
  { x: 210, y: 297 },
  { x: 0, y: 297 },
];

/**
 * Renders a synthetic photo (JPEG) of printed target `number` on a grey wall, seen through a real perspective
 * (sheet corners → `quad` in photo pixels). quad = null → photo without any target.
 * Returns the JPEG and the sheet-mm → photo-px homography.
 */
export async function makeTargetPhoto(
  browser: Browser,
  baseURL: string | undefined,
  opts: { number?: number; quad: Pt[] | null; width?: number; height?: number },
): Promise<{ jpeg: Buffer; h: H | null }> {
  const width = opts.width ?? 2400;
  const height = opts.height ?? 1600;
  const h = opts.quad ? homography(SHEET_CORNERS, opts.quad) : null;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/#/terce");
  await page.getByTestId("target-from").fill(String(opts.number ?? 1));
  await expect(page.getByTestId("target-sheet")).toHaveAttribute("data-number", String(opts.number ?? 1));

  const base64 = await page.evaluate(
    async ({ width, height, h }) => {
      const PX_PER_MM = 4;
      const sheet = document.createElement("canvas");
      sheet.width = 210 * PX_PER_MM;
      sheet.height = 297 * PX_PER_MM;
      const sctx = sheet.getContext("2d")!;
      const svg = document.querySelector("[data-testid=target-sheet]")!;
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();
      sctx.drawImage(img, 0, 0, sheet.width, sheet.height);
      const src = sctx.getImageData(0, 0, sheet.width, sheet.height).data;

      // Inverse homography (photo px → sheet mm) via adjugate.
      let inv: number[] | null = null;
      if (h) {
        const [a, b, c, d, e, f, g, k, l] = h;
        inv = [e * l - f * k, c * k - b * l, b * f - c * e, f * g - d * l, a * l - c * g, c * d - a * f, d * k - e * g, b * g - a * k, a * e - b * d];
      }
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const octx = out.getContext("2d")!;
      const dst = octx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          // Wall: light grey with a gentle gradient and texture.
          let v = 175 + ((x * 7 + y * 13) % 17) - 8 + (y / height) * 20;
          let r = v, gg = v, bb = v - 6;
          if (inv) {
            const w = inv[6] * x + inv[7] * y + inv[8];
            const u = ((inv[0] * x + inv[1] * y + inv[2]) / w) * PX_PER_MM;
            const t = ((inv[3] * x + inv[4] * y + inv[5]) / w) * PX_PER_MM;
            if (u >= 0 && t >= 0 && u < sheet.width && t < sheet.height) {
              const i = ((t | 0) * sheet.width + (u | 0)) * 4;
              r = src[i] * 0.92 + 10;
              gg = src[i + 1] * 0.92 + 10;
              bb = src[i + 2] * 0.92 + 10;
            }
          }
          dst.data[o] = r;
          dst.data[o + 1] = gg;
          dst.data[o + 2] = bb;
          dst.data[o + 3] = 255;
        }
      }
      octx.putImageData(dst, 0, 0);
      return out.toDataURL("image/jpeg", 0.92).split(",")[1];
    },
    { width, height, h },
  );
  await context.close();
  return { jpeg: Buffer.from(base64, "base64"), h };
}

/** Creates a real JPEG in the browser (canvas). noise=true makes a large, hard-to-compress photo. */
export async function makeJpeg(page: Page, width: number, height: number, noise = false): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width, height, noise }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      if (noise) {
        const img = ctx.createImageData(width, height);
        for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) >>> 24;
        ctx.putImageData(img, 0, 0);
      } else {
        ctx.fillStyle = "#cbd7e6";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#1a273d";
        ctx.fillRect(width * 0.1, height * 0.1, width * 0.3, height * 0.3);
      }
      return canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    },
    { width, height, noise },
  );
  return Buffer.from(base64, "base64");
}
