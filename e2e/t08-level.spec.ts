import { test, expect, type Page } from "@playwright/test";
import { makeTargetPhoto, pairPhone, project, type H, type Pt } from "./helpers";

// Front view of a wall; the A4 target hangs 5° crooked (clockwise). 3 photo px = 1 mm.
const PX_PER_MM = 3;
const TILT = (5 * Math.PI) / 180;
const CENTRE = { x: 1200, y: 800 };
const SHEET_CENTRE = { x: 105, y: 148.5 };
const tiltedQuad: Pt[] = [
  { x: 0, y: 0 },
  { x: 210, y: 0 },
  { x: 210, y: 297 },
  { x: 0, y: 297 },
].map((c) => {
  const dx = (c.x - SHEET_CENTRE.x) * PX_PER_MM;
  const dy = (c.y - SHEET_CENTRE.y) * PX_PER_MM;
  return { x: CENTRE.x + Math.cos(TILT) * dx - Math.sin(TILT) * dy, y: CENTRE.y + Math.sin(TILT) * dx + Math.cos(TILT) * dy };
});
// The wall in the photo: a level rectangle 1800 × 1300 px = 600 × 433.3 mm.
const WALL_PX: Pt[] = [
  { x: 300, y: 150 },
  { x: 2100, y: 150 },
  { x: 2100, y: 1450 },
  { x: 300, y: 1450 },
];
const TRUE_W = 1800 / PX_PER_MM;
const TRUE_H = 1300 / PX_PER_MM;

function invert(h: H): H {
  const [a, b, c, d, e, f, g, k, l] = h;
  return [e * l - f * k, c * k - b * l, b * f - c * e, f * g - d * l, a * l - c * g, c * d - a * f, d * k - e * g, b * g - a * k, a * e - b * d];
}

async function clickPhoto(page: Page, p: Pt) {
  const svg = page.getByTestId("measure-svg");
  const box = (await svg.boundingBox())!;
  const s = box.width / Number(await svg.getAttribute("data-photo-width"));
  await page.mouse.click(box.x + p.x * s, box.y + p.y * s);
}

/** Clicks the spot of a photo pixel on the straightened wall view (sheet mm → plane mm → current levelling → screen). */
async function clickWall(page: Page, h: H, photoPx: Pt, angleRad: number) {
  const sheet = project(invert(h), photoPx);
  const plane = { x: sheet.x - 15, y: sheet.y - 26 }; // plane origin = top-left corner of the black square
  const rot = { x: Math.cos(angleRad) * plane.x - Math.sin(angleRad) * plane.y, y: Math.sin(angleRad) * plane.x + Math.cos(angleRad) * plane.y };
  const svg = page.getByTestId("wall-svg");
  const box = (await svg.boundingBox())!;
  const scale = Number(await svg.getAttribute("data-scale"));
  const vx = Number(await svg.getAttribute("data-view-x"));
  const vy = Number(await svg.getAttribute("data-view-y"));
  await page.mouse.click(box.x + (rot.x - vx) * scale, box.y + (rot.y - vy) * scale);
}

async function wallSize(page: Page) {
  const size = page.getByTestId("wall-size");
  return { w: Number(await size.getAttribute("data-w")), h: Number(await size.getAttribute("data-h")) };
}

async function levelAngle(page: Page): Promise<number> {
  return Number(await page.getByTestId("level-status").getAttribute("data-angle"));
}

test("T08 a crooked target is corrected by the floor or by a drawn horizontal line", async ({ browser, page, baseURL }) => {
  const shot = await makeTargetPhoto(browser, baseURL, { number: 6, quad: tiltedQuad });
  await page.setViewportSize({ width: 1600, height: 1200 });
  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({ name: `[E2E] ${Date.now()} krivy.jpg`, mimeType: "image/jpeg", buffer: shot.jpeg });
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok", { timeout: 30_000 });
  await context.close();

  await page.getByRole("link", { name: /Měřit na fotce/ }).click();
  await page.getByRole("button", { name: "Vyznačit plochu" }).click();
  for (const p of WALL_PX) await clickPhoto(page, p);
  await page.getByRole("button", { name: "Uzavřít plochu a rozmístit zařízení" }).click();

  // The question is asked right away; without correction the level wall looks tilted (bigger bounding box).
  await expect(page.getByText("Je podlaha (zem) vodorovná?")).toBeVisible();
  const crooked = await wallSize(page);
  expect(crooked.w).toBeGreaterThan(TRUE_W + 20);

  // A socket placed before levelling stays on the wall after the correction.
  await page.getByRole("button", { name: /^Zásuvka/ }).click();

  // 1) "Yes, the floor is level" → straightened by the bottom edge.
  await page.getByRole("button", { name: "Ano – srovnat podle podlahy" }).click();
  await expect(page.getByTestId("level-status")).toHaveAttribute("data-mode", "floor");
  expect(Math.abs(Math.abs(await levelAngle(page)) - 5)).toBeLessThan(0.4);
  let size = await wallSize(page);
  expect(Math.abs(size.w - TRUE_W)).toBeLessThan(3);
  expect(Math.abs(size.h - TRUE_H)).toBeLessThan(3);
  await expect(page.getByTestId("device")).toHaveAttribute("data-problem", "");

  // 2) "No" → draw a horizontal line (here along a level line of the photo at y = 1300 px).
  let angleNow = ((await levelAngle(page)) * Math.PI) / 180; // read before the panel hides the status row
  await page.getByRole("button", { name: "Změnit" }).click();
  await page.getByRole("button", { name: "Ne – zakreslím vodorovnou čáru" }).click();
  await clickWall(page, shot.h!, { x: 500, y: 1300 }, angleNow);
  await expect(page.getByTestId("level-hint")).toContainText("druhý bod");
  await clickWall(page, shot.h!, { x: 1900, y: 1300 }, angleNow);
  await expect(page.getByTestId("level-status")).toHaveAttribute("data-mode", "line");
  expect(Math.abs(Math.abs(await levelAngle(page)) - 5)).toBeLessThan(0.4);
  await expect(page.getByTestId("level-line")).toHaveCount(1); // a level line has zero height, so "visible" does not apply
  size = await wallSize(page);
  expect(Math.abs(size.w - TRUE_W)).toBeLessThan(3);

  // 3) A line that is far from horizontal (here almost vertical) is refused with a clear message.
  angleNow = ((await levelAngle(page)) * Math.PI) / 180;
  await page.getByRole("button", { name: "Změnit" }).click();
  await page.getByRole("button", { name: "Ne – zakreslím vodorovnou čáru" }).click();
  await clickWall(page, shot.h!, { x: 600, y: 300 }, angleNow);
  await clickWall(page, shot.h!, { x: 700, y: 1300 }, angleNow);
  await expect(page.getByRole("alert")).toContainText("moc šikmá");
  await expect(page.getByTestId("level-status")).toHaveCount(0); // nothing changed, still drawing
  await page.getByRole("button", { name: "Zrušit" }).click();

  // 4) "The target hangs straight" removes the correction; the choice survives a reload.
  await page.getByRole("button", { name: "Terč visí rovně – bez korekce" }).click();
  await expect(page.getByTestId("level-status")).toHaveAttribute("data-mode", "target");
  expect(await levelAngle(page)).toBeCloseTo(0, 5);
  expect(Math.abs((await wallSize(page)).w - crooked.w)).toBeLessThan(1);
  await page.reload();
  await expect(page.getByTestId("level-status")).toHaveAttribute("data-mode", "target");
  await expect(page.getByText("Je podlaha (zem) vodorovná?")).toHaveCount(0);
});
