import { test, expect } from "@playwright/test";
import { makeTargetPhoto, pairPhone, type Pt } from "./helpers";

const stamp = () => `[E2E] ${Date.now()}`;

// Where the A4 sheet corners land in a 2400 × 1600 photo.
const FRONT: Pt[] = [
  { x: 880, y: 300 },
  { x: 1510, y: 300 },
  { x: 1510, y: 1191 },
  { x: 880, y: 1191 },
];
const SIDE_EXTREME: Pt[] = [
  { x: 900, y: 200 },
  { x: 1250, y: 560 },
  { x: 1250, y: 1040 },
  { x: 900, y: 1400 },
];
const FAR: Pt[] = [
  { x: 1100, y: 700 },
  { x: 1205, y: 700 },
  { x: 1205, y: 848 },
  { x: 1100, y: 848 },
];

// T03: after sending, the phone gets a receipt AND learns whether each photo is usable for measuring.
test("T03 every received photo is checked for the target, phone and PC show the verdict", async ({ browser, page, baseURL }) => {
  const front = await makeTargetPhoto(browser, baseURL, { number: 7, quad: FRONT });
  const side = await makeTargetPhoto(browser, baseURL, { number: 7, quad: SIDE_EXTREME });
  const far = await makeTargetPhoto(browser, baseURL, { number: 7, quad: FAR });
  const none = await makeTargetPhoto(browser, baseURL, { quad: null });

  const { context, phone } = await pairPhone(browser, baseURL, page);
  const name = stamp();
  await phone.getByTestId("photo-input").setInputFiles([
    { name: `${name} zepredu.jpg`, mimeType: "image/jpeg", buffer: front.jpeg },
    { name: `${name} z-boku.jpg`, mimeType: "image/jpeg", buffer: side.jpeg },
    { name: `${name} daleko.jpg`, mimeType: "image/jpeg", buffer: far.jpeg },
    { name: `${name} bez-terce.jpg`, mimeType: "image/jpeg", buffer: none.jpeg },
  ]);

  await expect(phone.getByTestId("sent-summary")).toHaveText("Přijato 4 z 4", { timeout: 45_000 });
  const verdicts = phone.getByTestId("sent-quality");
  await expect(verdicts.nth(0)).toHaveAttribute("data-quality", "ok", { timeout: 20_000 });
  await expect(verdicts.nth(0)).toContainText("Terč č. 7 nalezen");
  await expect(verdicts.nth(1)).toHaveAttribute("data-quality", "skewed", { timeout: 20_000 });
  await expect(verdicts.nth(2)).toHaveAttribute("data-quality", "small", { timeout: 20_000 });
  await expect(verdicts.nth(3)).toHaveAttribute("data-quality", "missing", { timeout: 20_000 });
  await expect(verdicts.nth(3)).toContainText("Terč nenalezen");
  await expect(phone.getByTestId("usable-summary")).toHaveText("Použitelné pro měření: 1 z 4");

  await expect(page.getByTestId("usable-summary")).toContainText("1 z 4");
  await expect(page.getByTestId("photo").nth(0)).toHaveAttribute("data-quality", "ok");
  await expect(page.getByTestId("photo").nth(3)).toHaveAttribute("data-quality", "missing");
  await context.close();
});

test("T03 the verdicts are kept after reloading the PC page", async ({ browser, page, baseURL }) => {
  const front = await makeTargetPhoto(browser, baseURL, { number: 2, quad: FRONT });
  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({ name: `${stamp()} a.jpg`, mimeType: "image/jpeg", buffer: front.jpeg });
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok", { timeout: 30_000 });
  await context.close();
  await page.reload();
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok");
  await expect(page.getByTestId("photo-quality")).toContainText("Terč č. 2 nalezen");
});
