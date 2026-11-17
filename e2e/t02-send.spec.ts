import { test, expect } from "@playwright/test";
import { makeJpeg, openPc, openPhone, pairPhone } from "./helpers";

const stamp = () => `[E2E] ${Date.now()}`;

// T02: photos picked on the phone arrive on the PC, are confirmed and survive a reload.
test("T02 phone sends photos, PC shows and keeps them, delete asks first", async ({ browser, page, baseURL }) => {
  const { context, phone } = await pairPhone(browser, baseURL, page);
  const name = stamp();
  await phone.getByTestId("photo-input").setInputFiles([
    { name: `${name} stena-1.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(phone, 1200, 900) },
    { name: `${name} stena-2.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(phone, 900, 1200) },
  ]);

  await expect(phone.getByTestId("sent-summary")).toHaveText("Přijato 2 z 2");
  await expect(phone.getByTestId("sent-item").filter({ hasText: "Přijato" })).toHaveCount(2);
  await expect(page.getByTestId("photo-count")).toHaveText("(2)");
  await expect(page.getByTestId("photo").first()).toContainText("1200 × 900 px");
  await expect(page.getByTestId("photo").nth(1)).toContainText("900 × 1200 px");

  await page.reload();
  await expect(page.getByTestId("photo")).toHaveCount(2);

  // Delete: cancel keeps the photo, confirm removes it.
  await page.getByRole("button", { name: `Smazat fotku ${name} stena-1.jpg` }).click();
  await expect(page.getByRole("dialog")).toContainText("nenávratně smaže");
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByTestId("photo")).toHaveCount(2);
  await page.getByRole("button", { name: `Smazat fotku ${name} stena-1.jpg` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page.getByTestId("photo")).toHaveCount(1);
  await expect(page.getByTestId("photo-count")).toHaveText("(1)");

  await context.close();
});

test("T02 large photo is transferred in pieces with progress", async ({ browser, page, baseURL }) => {
  const { context, phone } = await pairPhone(browser, baseURL, page);
  const big = await makeJpeg(phone, 4000, 3000, true);
  expect(big.byteLength).toBeGreaterThan(2 * 1024 * 1024);
  await phone.getByTestId("photo-input").setInputFiles({ name: `${stamp()} velka.jpg`, mimeType: "image/jpeg", buffer: big });

  await expect(phone.getByTestId("sent-summary")).toHaveText("Přijato 1 z 1", { timeout: 45_000 });
  await expect(page.getByTestId("photo")).toContainText("4000 × 3000 px");
  await context.close();
});

test("T02 a file that is not a photo is refused with a clear message", async ({ browser, page, baseURL }) => {
  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({
    name: `${stamp()} falesna.jpg`,
    mimeType: "image/jpeg",
    buffer: Buffer.from("this is not an image"),
  });
  const item = phone.getByTestId("sent-item");
  await expect(item).toHaveAttribute("data-state", "failed");
  await expect(item).toContainText("není fotka");
  await expect(page.getByTestId("photos-empty")).toBeVisible();
  await context.close();
});

test("T02 PC can refuse a phone; an approved phone is remembered", async ({ browser, page, baseURL }) => {
  const hash = await openPc(page);

  const stranger = await openPhone(browser, baseURL, hash);
  await expect(stranger.phone.getByTestId("phone-status")).toHaveText("Povol telefon na počítači");
  await page.getByRole("button", { name: "Odmítnout" }).click();
  await expect(stranger.phone.getByTestId("phone-status")).toHaveText("Počítač připojení odmítl");
  await expect(stranger.phone.getByTestId("add-photos")).toBeDisabled();
  await stranger.context.close();

  const { context, phone } = await openPhone(browser, baseURL, hash);
  await page.getByRole("button", { name: "Povolit" }).click();
  await expect(phone.getByTestId("phone-status")).toHaveText("Spojeno s počítačem");
  await phone.reload();
  await expect(phone.getByTestId("phone-status")).toHaveText("Spojeno s počítačem");
  await context.close();
});
