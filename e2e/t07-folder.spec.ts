import { test, expect, type Page } from "@playwright/test";
import { makeTargetPhoto, pairPhone, project, SHEET_CORNERS, type Pt } from "./helpers";

const FRONT: Pt[] = [
  { x: 880, y: 300 },
  { x: 1510, y: 300 },
  { x: 1510, y: 1191 },
  { x: 880, y: 1191 },
];

/** Lists one job folder of the test "PC folder" (browser private file system): JSON files as text, others as size. */
async function readJobFolder(page: Page, job: string): Promise<Record<string, string | number> | null> {
  return page.evaluate(async (job) => {
    const root = await navigator.storage.getDirectory();
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle(job);
    } catch {
      return null;
    }
    const out: Record<string, string | number> = {};
    // @ts-expect-error entries() is not in every TS DOM lib version
    for await (const [name, handle] of dir.entries()) {
      const file = await (handle as FileSystemFileHandle).getFile();
      out[name] = name.endsWith(".json") ? await file.text() : file.size;
    }
    return out;
  }, job);
}

async function clickPhoto(page: Page, p: Pt) {
  const svg = page.getByTestId("measure-svg");
  const box = (await svg.boundingBox())!;
  const s = box.width / Number(await svg.getAttribute("data-photo-width"));
  await page.mouse.click(box.x + p.x * s, box.y + p.y * s);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __E2E_FOLDER__: boolean }).__E2E_FOLDER__ = true;
  });
});

test("T07 photos, dimensions and walls are saved as files into the job folder", async ({ browser, page, baseURL }) => {
  const shot = await makeTargetPhoto(browser, baseURL, { number: 5, quad: FRONT });
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/");
  await expect(page.getByTestId("folder-state")).toHaveAttribute("data-state", "none");

  // Job name with characters Windows does not allow in folder names.
  const stamp = Date.now();
  await page.getByTestId("job-name").fill(`[E2E] ${stamp} Novák/Dvořák: rozvaděč`);
  const jobFolder = `[E2E] ${stamp} Novák-Dvořák- rozvaděč`;
  await page.getByRole("button", { name: "Vybrat složku" }).click();
  await expect(page.getByTestId("folder-state")).toHaveAttribute("data-state", "ready");

  const { context, phone } = await pairPhone(browser, baseURL, page);
  await phone.getByTestId("photo-input").setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: shot.jpeg });
  await expect(page.getByTestId("photo")).toHaveAttribute("data-quality", "ok", { timeout: 30_000 });
  await context.close();

  // The photo file and its measurement file appear in the job folder.
  await expect
    .poll(async () => Object.keys((await readJobFolder(page, jobFolder)) ?? {}).sort(), { timeout: 15_000 })
    .toEqual(["0001-IMG_0001.jpg", "0001-IMG_0001.mereni.json"]);
  const files = (await readJobFolder(page, jobFolder))!;
  expect(files["0001-IMG_0001.jpg"]).toBe(shot.jpeg.byteLength);
  expect(JSON.parse(files["0001-IMG_0001.mereni.json"] as string).target).toMatchObject({ number: 5, quality: "ok" });

  // A dimension is written to the measurement file.
  await page.getByRole("link", { name: /Měřit na fotce/ }).click();
  await clickPhoto(page, project(shot.h!, { x: 15, y: 262 }));
  await clickPhoto(page, project(shot.h!, { x: 115, y: 262 }));
  await expect
    .poll(async () => {
      const json = (await readJobFolder(page, jobFolder))?.["0001-IMG_0001.mereni.json"];
      return json ? JSON.parse(json as string).dimensions_mm.map((d: { length: number }) => Math.round(d.length)) : [];
    }, { timeout: 15_000 })
    .toEqual([expect.any(Number)]);
  const dims = JSON.parse((await readJobFolder(page, jobFolder))!["0001-IMG_0001.mereni.json"] as string).dimensions_mm;
  expect(Math.abs(dims[0].length - 100)).toBeLessThan(2);

  // A wall with a device is written as its own file, in installer terms (from left, centre above floor).
  await page.getByRole("button", { name: "Vyznačit plochu" }).click();
  for (const corner of SHEET_CORNERS) await clickPhoto(page, project(shot.h!, corner));
  await page.getByRole("button", { name: "Uzavřít plochu a rozmístit zařízení" }).click();
  await page.getByRole("button", { name: /^Zásuvka/ }).click();
  await page.getByTestId("edit-height").fill("100");
  await page.getByTestId("edit-height").press("Enter");

  await expect
    .poll(async () => Object.keys((await readJobFolder(page, jobFolder)) ?? {}).filter((n) => n.startsWith("plocha-")), { timeout: 15_000 })
    .toHaveLength(1);
  await expect
    .poll(async () => {
      const files = (await readJobFolder(page, jobFolder))!;
      const wall = JSON.parse(files[Object.keys(files).find((n) => n.startsWith("plocha-"))!] as string);
      return wall.devices[0]?.centre_above_floor_mm;
    }, { timeout: 15_000 })
    .toBe(100);
  const all = (await readJobFolder(page, jobFolder))!;
  const wall = JSON.parse(all[Object.keys(all).find((n) => n.startsWith("plocha-"))!] as string);
  expect(wall.photo).toBe("0001-IMG_0001.jpg");
  expect(wall.devices[0]).toMatchObject({ name: "Zásuvka", width_mm: 80, height_mm: 80 });
  expect(Math.abs(wall.size_mm.width - 210)).toBeLessThan(3);
  expect(Math.abs(wall.size_mm.height - 297)).toBeLessThan(4);

  // The chosen folder is remembered after a reload.
  await page.goto("/");
  await expect(page.getByTestId("folder-state")).toHaveAttribute("data-state", "ready");
});
