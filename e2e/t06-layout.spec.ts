import { test, expect, type Page } from "@playwright/test";
import { makeTargetPhoto, pairPhone, project, SHEET_CORNERS, type Pt } from "./helpers";

// Photo of the A4 target taken at an angle; the "wall" is the A4 sheet itself (210 × 297 mm).
const PERSPECTIVE: Pt[] = [
  { x: 700, y: 250 },
  { x: 1450, y: 380 },
  { x: 1450, y: 1290 },
  { x: 700, y: 1450 },
];

async function clickPhoto(page: Page, p: Pt) {
  const svg = page.getByTestId("measure-svg");
  const box = (await svg.boundingBox())!;
  const s = box.width / Number(await svg.getAttribute("data-photo-width"));
  await page.mouse.click(box.x + p.x * s, box.y + p.y * s);
}

async function dim(page: Page, side: "left" | "right" | "up" | "down"): Promise<number> {
  return Number(await page.locator(`[data-testid=device-dim][data-side=${side}]`).getAttribute("data-mm"));
}

async function selectDevice(page: Page, index: number) {
  await page.getByTestId("device-item").nth(index).click();
}

async function setField(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press("Enter");
  await input.blur();
}

test("T06 outline a wall on an angled photo and lay out devices with live dimensions", async ({ browser, page, baseURL }) => {
  const shot = await makeTargetPhoto(browser, baseURL, { number: 4, quad: PERSPECTIVE });
  await page.setViewportSize({ width: 1600, height: 1200 });
  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({ name: `[E2E] ${Date.now()} zed.jpg`, mimeType: "image/jpeg", buffer: shot.jpeg });
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok", { timeout: 30_000 });
  await context.close();

  // 1) Outline the wall on the photo.
  await page.getByRole("link", { name: /Měřit na fotce/ }).click();
  await page.getByRole("button", { name: "Vyznačit plochu" }).click();
  for (const corner of SHEET_CORNERS) await clickPhoto(page, project(shot.h!, corner));
  await page.getByRole("button", { name: "Uzavřít plochu a rozmístit zařízení" }).click();
  await expect(page).toHaveURL(/#\/plocha\/\d+$/);

  // The straightened wall has the real size and is upright (not rotated).
  const size = page.getByTestId("wall-size");
  await expect(size).toBeVisible();
  expect(Math.abs(Number(await size.getAttribute("data-w")) - 210)).toBeLessThan(3);
  expect(Math.abs(Number(await size.getAttribute("data-h")) - 297)).toBeLessThan(4);

  // 2) A socket in the middle: dimensions to the wall edges add up to the wall size.
  await page.getByRole("button", { name: /^Zásuvka/ }).click();
  await expect(page.getByTestId("device")).toHaveCount(1);
  const w = Number(await size.getAttribute("data-w"));
  const h = Number(await size.getAttribute("data-h"));
  expect(Math.abs((await dim(page, "left")) + 80 + (await dim(page, "right")) - w)).toBeLessThan(0.5);
  expect(Math.abs((await dim(page, "up")) + 80 + (await dim(page, "down")) - h)).toBeLessThan(0.5);

  // 3) Keyboard: 3× arrow right = 30 mm, Shift+arrow = 1 mm.
  const left0 = await dim(page, "left");
  await page.getByTestId("wall-canvas").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await dim(page, "left")).toBeCloseTo(left0 + 29, 1);

  // 4) Exact position from the editor: 20 mm from the left, centre 100 mm above the floor.
  await setField(page, "edit-left", "20");
  await setField(page, "edit-height", "100");
  expect(await dim(page, "left")).toBeCloseTo(20, 0);
  expect(await dim(page, "down")).toBeCloseTo(60, 0);

  // 5) Second device: the dimension between the two devices.
  await page.getByTestId("custom-name").fill("Krabice");
  await page.getByTestId("custom-w").fill("5");
  await page.getByTestId("custom-h").fill("abc");
  await page.getByRole("button", { name: "Přidat vlastní" }).click();
  await expect(page.getByRole("alert")).toContainText("musí být čísla od 10 do 20000 mm");
  await expect(page.getByTestId("device")).toHaveCount(1);
  await page.getByTestId("custom-w").fill("40");
  await page.getByTestId("custom-h").fill("40");
  await page.getByRole("button", { name: "Přidat vlastní" }).click();
  await expect(page.getByTestId("device")).toHaveCount(2);
  await setField(page, "edit-left", "150");
  await setField(page, "edit-height", "100");
  await selectDevice(page, 0);
  expect(await dim(page, "right")).toBeCloseTo(50, 0); // 150 − (20 + 80)

  // 6) Drag the box with the mouse 40 mm to the right → it sticks out of the wall and turns red.
  const svg = page.getByTestId("wall-svg");
  const scale = Number(await svg.getAttribute("data-scale"));
  const boxDevice = page.locator("[data-testid=device][data-name=Krabice]");
  const b = (await boxDevice.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 20 * scale, b.y + b.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2 + 40 * scale, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(boxDevice).toHaveAttribute("data-problem", "outside");
  expect(Number(await page.getByTestId("edit-left").inputValue())).toBe(190);

  // 7) Everything is kept after reload; deleting asks first.
  await page.reload();
  await expect(page.getByTestId("device")).toHaveCount(2);
  await selectDevice(page, 1);
  await page.getByRole("button", { name: "Smazat zařízení" }).click();
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByTestId("device")).toHaveCount(2);
  await page.getByRole("button", { name: "Smazat zařízení" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page.getByTestId("device")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("wall-layout.png") });

  // 8) The wall is listed on the main page and can be deleted there (with confirmation).
  await page.getByRole("link", { name: "← Fotky" }).click();
  await expect(page.getByTestId("wall-item")).toHaveCount(1);
  await expect(page.getByTestId("wall-item")).toContainText("1 zařízení");
  await page.getByRole("button", { name: /Smazat plochu/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page.getByTestId("wall-item")).toHaveCount(0);
});

test("T06 a missing wall shows a clear message", async ({ page }) => {
  await page.goto("/#/plocha/999999");
  await expect(page.getByTestId("wall-error")).toContainText("Plocha nenalezena");
});
