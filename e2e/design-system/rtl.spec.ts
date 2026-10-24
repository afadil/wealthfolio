import { expect, test, type Page } from "@playwright/test";
import { navigate, openGallery, overlays, settle } from "./gallery";

// Right-to-left behaviour of the primitives, through the development-only
// direction override (no shipped language is right-to-left yet): arrows that
// point forward in the reading direction, popups on the mirrored side, and a
// live switch that leaves no left-to-right state behind.

const overlay = (name: string) => overlays.find((item) => item.name === name)!;

function setDirection(page: Page, direction: "ltr" | "rtl") {
  return page.evaluate(
    (value) =>
      (
        globalThis as unknown as { __wealthfolioSetDirection: (dir: string) => void }
      ).__wealthfolioSetDirection(value),
    direction,
  );
}

test("the document and portalled popups read right-to-left", async ({ page }) => {
  await openGallery(page, { dir: "rtl" });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await overlay("popover").open(page);
  const popup = overlay("popover").content(page);
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
});

test("tabs and toggle groups move forward with ArrowLeft", async ({ page }) => {
  await openGallery(page, { dir: "rtl" });
  await page.getByRole("tab", { name: "Overview" }).focus();
  await navigate(page, "ArrowLeft");
  await expect(page.getByRole("tab", { name: "Holdings" })).toBeFocused();

  const range = page.getByRole("group", { name: "Range" });
  await range.getByRole("button", { name: "1m" }).focus();
  await navigate(page, "ArrowLeft");
  await expect(range.getByRole("button", { name: "1y" })).toBeFocused();
});

test("a submenu opens with ArrowLeft, on the left of its menu", async ({ page }) => {
  await openGallery(page, { dir: "rtl" });
  await overlay("menu").open(page);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await page.getByRole("menuitem", { name: "Move to" }).focus();
  await navigate(page, "ArrowLeft");
  const submenu = page.getByRole("menu").filter({ hasNot: page.getByText("Move to") });
  await expect(submenu).toBeVisible();
  await settle(page);
  const [menuBox, submenuBox] = await Promise.all([
    menu.first().boundingBox(),
    submenu.boundingBox(),
  ]);
  // Submenus overlap their menu by a few pixels in both directions; compare centres.
  expect(submenuBox!.x + submenuBox!.width / 2).toBeLessThan(menuBox!.x + menuBox!.width / 2);
  await expect(submenu).toHaveAttribute("data-side", "inline-end");
});

test("the side sheet comes in from the left edge", async ({ page }) => {
  await openGallery(page, { dir: "rtl" });
  await page.getByRole("button", { name: "Open sheet", exact: true }).click();
  const sheet = overlay("sheet").content(page);
  await expect(sheet).toBeVisible();
  await settle(page);
  expect((await sheet.boundingBox())!.x).toBe(0);
});

test("switching direction live re-mirrors keyboard and layout", async ({ page }) => {
  await openGallery(page);
  const overview = page.getByRole("tab", { name: "Overview" });
  const holdings = page.getByRole("tab", { name: "Holdings" });
  const panelEdge = () =>
    page
      .getByRole("tablist")
      .boundingBox()
      .then((box) => box!.x);
  const ltrEdge = await panelEdge();

  await setDirection(page, "rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await panelEdge()).toBeGreaterThan(ltrEdge);
  await overview.click();
  await navigate(page, "ArrowLeft");
  await expect(holdings).toBeFocused();

  await setDirection(page, "ltr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  expect(await panelEdge()).toBe(ltrEdge);
  await overview.click();
  await navigate(page, "ArrowRight");
  await expect(holdings).toBeFocused();
});
