import { test, expect, type Page } from "@playwright/test";
import { makeTargetPhoto, pairPhone, project, type H, type Pt } from "./helpers";

const stamp = () => `[E2E] ${Date.now()}`;

// Known points on the printed sheet (mm from the sheet's top-left corner).
const RULER_0: Pt = { x: 15, y: 262 };
const RULER_100: Pt = { x: 115, y: 262 };
const MARKER_TL: Pt = { x: 15, y: 26 };
const MARKER_BR: Pt = { x: 195, y: 206 };

/** Clicks a photo pixel on the measuring view. */
async function clickPhoto(page: Page, p: Pt) {
  const svg = page.getByTestId("measure-svg");
  const box = (await svg.boundingBox())!;
  const photoWidth = Number(await svg.getAttribute("data-photo-width"));
  const s = box.width / photoWidth;
  await page.mouse.click(box.x + p.x * s, box.y + p.y * s);
}

async function measure(page: Page, h: H, a: Pt, b: Pt): Promise<number> {
  const before = await page.getByTestId("dim-label").count();
  await clickPhoto(page, project(h, a));
  await expect(page.getByTestId("measure-hint")).toContainText("druhý bod");
  await clickPhoto(page, project(h, b));
  const label = page.getByTestId("dim-label").nth(before);
  await expect(label).toBeVisible();
  const mm = Number(await label.getAttribute("data-mm"));
  return mm;
}

async function openPhotoForMeasuring(browser: import("@playwright/test").Browser, baseURL: string | undefined, page: Page, quad: Pt[]) {
  const shot = await makeTargetPhoto(browser, baseURL, { number: 3, quad });
  await page.setViewportSize({ width: 1600, height: 1200 });
  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({ name: `${stamp()} stena.jpg`, mimeType: "image/jpeg", buffer: shot.jpeg });
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok", { timeout: 30_000 });
  await context.close();
  await page.getByRole("link", { name: /Měřit na fotce/ }).click();
  await expect(page.getByTestId("measure-svg")).toBeVisible();
  return shot.h!;
}

test("T05 dimensions on a photo taken from the front are correct", async ({ browser, page, baseURL }) => {
  const h = await openPhotoForMeasuring(browser, baseURL, page, [
    { x: 880, y: 300 },
    { x: 1510, y: 300 },
    { x: 1510, y: 1191 },
    { x: 880, y: 1191 },
  ]);
  expect(Math.abs((await measure(page, h, RULER_0, RULER_100)) - 100)).toBeLessThan(1.5);
  const diagonal = Math.hypot(180, 180);
  expect(Math.abs((await measure(page, h, MARKER_TL, MARKER_BR)) - diagonal)).toBeLessThan(diagonal * 0.01);
  await expect(page.getByTestId("dim-item")).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath("measure-view.png") });
});

test("T05 dimensions are correct also on a photo taken at an angle (perspective)", async ({ browser, page, baseURL }) => {
  const h = await openPhotoForMeasuring(browser, baseURL, page, [
    { x: 700, y: 250 },
    { x: 1450, y: 380 },
    { x: 1450, y: 1290 },
    { x: 700, y: 1450 },
  ]);
  const ruler = await measure(page, h, RULER_0, RULER_100);
  expect(Math.abs(ruler - 100)).toBeLessThan(2);
  // Point far outside the target (the sheet's bottom-right corner) still measures right.
  const far = Math.hypot(210 - 15, 297 - 26);
  expect(Math.abs((await measure(page, h, MARKER_TL, { x: 210, y: 297 })) - far)).toBeLessThan(far * 0.015);
});

test("T05 dimensions are kept after reload and deleting asks first", async ({ browser, page, baseURL }) => {
  const h = await openPhotoForMeasuring(browser, baseURL, page, [
    { x: 880, y: 300 },
    { x: 1510, y: 300 },
    { x: 1510, y: 1191 },
    { x: 880, y: 1191 },
  ]);
  await measure(page, h, RULER_0, RULER_100);
  await measure(page, h, MARKER_TL, MARKER_BR);

  // Escape cancels a half-drawn dimension.
  await clickPhoto(page, project(h, RULER_0));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("measure-hint")).toContainText("první bod");

  await page.reload();
  await expect(page.getByTestId("dim-item")).toHaveCount(2);
  await expect(page.getByTestId("dim-item").first()).toContainText(/1: 10[01] mm|1: 99 mm/);

  await page.getByRole("button", { name: "Smazat kótu 1" }).click();
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByTestId("dim-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Smazat kótu 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page.getByTestId("dim-item")).toHaveCount(1);

  await page.getByRole("link", { name: "← Fotky" }).click();
  await expect(page.getByText("Kóty (1)")).toBeVisible();
});

test("T05 a photo without a target cannot be opened for measuring", async ({ page }) => {
  await page.goto("/#/foto/999999");
  await expect(page.getByTestId("measure-error")).toContainText("Fotka nenalezena");
});
