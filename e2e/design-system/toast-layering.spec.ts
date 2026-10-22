import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  for (const dir of ["ltr", "rtl"]) {
    test(`background notifications do not block a modal action (${width}px ${dir})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/e2e/design-system/?blockingToast=1&dir=${dir}`);
      const notification = page.locator("[data-sonner-toast]").first();
      await expect(notification).toBeVisible();
      await page.getByRole("button", { name: "Open dialog", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Review activity" });
      const close = dialog.getByRole("button", { name: "Close", exact: true });
      await expect(close).toBeVisible();
      await close.click({ trial: true });

      // Reproduce a notification covering an action in a large activity form.
      const bounds = await close.boundingBox();
      expect(bounds).not.toBeNull();
      if (!bounds) return;
      const originalStyle = await notification.getAttribute("style");
      await notification.evaluate((element, rect) => {
        Object.assign(element.style, {
          position: "fixed",
          top: `${rect.y}px`,
          left: `${rect.x}px`,
          bottom: "auto",
          right: "auto",
          width: "240px",
          height: "60px",
          transform: "none",
        });
      }, bounds);
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      await expect
        .poll(() =>
          page.evaluate(
            ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'),
            point,
          ),
        )
        .toBe(true);
      await close.click();
      await expect(dialog).toBeHidden();
      // Outside a modal the same notification must remain dismissible.
      await notification.evaluate(
        (element, style) => element.setAttribute("style", style ?? ""),
        originalStyle,
      );
      await notification.getByRole("button", { name: "View details", exact: true }).click();
      await expect(notification).toBeHidden();
    });
  }
}
