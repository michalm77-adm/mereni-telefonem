import { test, expect, type Page } from "@playwright/test";

// Known codes of ArUco dictionary ARUCO_MIP_36h12 (independent of the app's copy).
const EXPECTED_CODES: Record<number, number> = { 1: 0x6001134e5, 2: 0x1206fbe72, 3: 0xff8ad6cb4 };

/** Renders a sheet to a canvas and reads the 6×6 data cells back from the pixels. */
async function readMarkerCode(page: Page, index: number): Promise<number> {
  const bits = await page.evaluate(async (i) => {
    const svg = document.querySelectorAll<SVGSVGElement>("[data-testid=target-sheet]")[i];
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    await img.decode();
    const scale = 4; // px per mm
    const canvas = document.createElement("canvas");
    canvas.width = 210 * scale;
    canvas.height = 297 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const cell = 180 / 8;
    let out = "";
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const px = (15 + (x + 1.5) * cell) * scale;
        const py = (26 + (y + 1.5) * cell) * scale;
        out += ctx.getImageData(px, py, 1, 1).data[0] > 128 ? "1" : "0";
      }
    }
    return out;
  }, index);
  return parseInt(bits, 2);
}

test("T04 target page shows one A4 target that matches the ArUco standard", async ({ page }) => {
  await page.goto("/#/terce");
  const sheets = page.getByTestId("target-sheet");
  await expect(sheets).toHaveCount(1);
  await expect(sheets.first()).toHaveAttribute("data-number", "1");
  await expect(page.getByTestId("target-marker")).toHaveAttribute("data-side-mm", "180");
  expect(await readMarkerCode(page, 0)).toBe(EXPECTED_CODES[1]);
});

test("T04 several targets print as separate A4 pages", async ({ page }) => {
  await page.goto("/#/terce");
  await page.getByTestId("target-count").fill("3");
  const sheets = page.getByTestId("target-sheet");
  await expect(sheets).toHaveCount(3);
  for (const i of [0, 1, 2]) {
    await expect(sheets.nth(i)).toHaveAttribute("data-number", String(i + 1));
    expect(await readMarkerCode(page, i)).toBe(EXPECTED_CODES[i + 1]);
  }

  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3);
  // A4 = 595.28 × 841.89 pt
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(Number(box![1])).toBeCloseTo(595.28, 0);
  expect(Number(box![2])).toBeCloseTo(841.89, 0);
});

test("T04 wrong numbers show a clear message and block printing", async ({ page }) => {
  await page.goto("/#/terce");
  const print = page.getByRole("button", { name: /Vytisknout/ });
  await page.getByTestId("target-count").fill("0");
  await expect(page.getByRole("alert")).toContainText("Zadej počet od 1 do 20");
  await expect(print).toBeDisabled();
  await page.getByTestId("target-count").fill("2");
  await page.getByTestId("target-from").fill("abc");
  await expect(page.getByRole("alert")).toContainText("Zadej číslo od 1 do 249");
  await expect(print).toBeDisabled();
  await page.getByTestId("target-from").fill("249");
  await expect(page.getByRole("alert")).toContainText("nejvyšší je 249");
  await page.getByTestId("target-from").fill("5");
  await expect(print).toBeEnabled();
  await expect(page.getByTestId("target-sheet")).toHaveCount(2);
});

test("T04 PC page links to target printing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Tisk terčů" }).click();
  await expect(page.getByTestId("target-sheet")).toHaveCount(1);
});
