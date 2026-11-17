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
