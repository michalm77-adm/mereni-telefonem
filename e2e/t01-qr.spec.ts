import { test, expect } from "@playwright/test";
import { openPc, openPhone } from "./helpers";

// T01: the PC shows a QR code; opening its link on a phone shows the sender page connected to the PC.
test("T01 PC shows QR code and the phone connects through its link", async ({ browser, page, baseURL }) => {
  await page.goto("/");
  await expect(page.getByTestId("pc-status")).toHaveText(/čekám na telefon/);
  const qr = page.getByTestId("qr");
  await expect(qr.locator("img")).toBeVisible();
  expect(await qr.getAttribute("data-sender-url")).toMatch(/#\/send\?pc=2m-mereni-pc-[0-9a-f]{24}$/);

  const { context, phone } = await openPhone(browser, baseURL, await openPc(page));
  await expect(phone.getByTestId("phone-status")).toHaveText("Povol telefon na počítači");
  await expect(phone.getByTestId("add-photos")).toBeDisabled();
  await expect(page.getByTestId("phones")).toContainText("Android telefon");

  await page.getByRole("button", { name: "Povolit" }).click();
  await expect(phone.getByTestId("phone-status")).toHaveText("Spojeno s počítačem");
  await expect(phone.getByTestId("add-photos")).toBeEnabled();

  await context.close();
  // The PC notices the phone is gone at the latest after its ping timeout (10 s).
  await expect(page.getByTestId("phones-empty")).toBeVisible({ timeout: 15_000 });
});

test("T01 PC keeps the same QR code after a page reload", async ({ page }) => {
  await page.goto("/");
  const first = await page.getByTestId("qr").getAttribute("data-sender-url");
  await page.reload();
  await expect(page.getByTestId("pc-status")).toHaveText(/čekám na telefon/, { timeout: 20_000 });
  expect(await page.getByTestId("qr").getAttribute("data-sender-url")).toBe(first);
});

test("T01 invalid link on the phone shows a clear message", async ({ page }) => {
  await page.goto("/#/send?pc=<script>");
  await expect(page.getByTestId("phone-status")).toHaveText("Neplatný odkaz");
});
