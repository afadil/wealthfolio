import { expect, test } from "@playwright/test";

for (const width of [320, 592, 992]) {
  test(`German growth values stay contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/e2e/net-worth/");
    const card = page.getByRole("main", { name: "Net worth card" });
    await expect(card.getByRole("button", { name: /^Investments / })).toBeVisible();
    await expect(card.getByText("123.456,8×", { exact: true })).toBeVisible();
    await expect(card.getByText(/^=\s*Nettovermögen$/)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    if (width === 992) {
      // With ample space, a compact multiple should not break mid-number.
      const lines = await card.getByText("123.456,8×", { exact: true }).evaluate((label) => {
        const range = document.createRange();
        range.selectNodeContents(label);
        return range.getClientRects().length;
      });
      expect(lines).toBe(1);
    }

    const violations = await card.evaluate((root) => {
      const errors: string[] = [];
      // Use painted text rectangles: element boxes alone miss text spilling out
      // of a fixed-width label (the original w-12 regression).
      const bounds = root.firstElementChild!.getBoundingClientRect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const parent = node.parentElement!.getBoundingClientRect();
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
            errors.push(`Outside card: ${node.textContent}`);
          }
          if (rect.left < parent.left - 1 || rect.right > parent.right + 1) {
            errors.push(`Outside label: ${node.textContent}`);
          }
        }
      }
      // A flex child can spill into the neighboring grid column even when
      // the grid cell itself is correctly positioned (the min-w-12-only fix).
      for (const element of root.querySelectorAll("div, span")) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const parent = element.parentElement!.getBoundingClientRect();
        if (rect.left < parent.left - 1 || rect.right > parent.right + 1) {
          errors.push(`Outside cell: ${element.textContent}`);
        }
      }
      // Include category rows and the net-worth footer. Compare adjacent cells
      // only when they occupy the same line, allowing the narrow stacked layout.
      const rows = [...root.querySelectorAll('[role="button"]')];
      const total = [...root.querySelectorAll("div")].find((element) =>
        [...element.children].some((child) => child.textContent?.trim() === "=Nettovermögen"),
      );
      if (total) rows.push(total);
      else errors.push("Net worth footer was not checked");
      for (const row of rows) {
        const cells = [...row.children].map((element) => element.getBoundingClientRect());
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i],
              b = cells[j];
            const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (horizontal > 1 && vertical > 1)
              errors.push(`Overlapping cells: ${row.textContent}`);
          }
        }
      }
      return errors;
    });
    expect(violations).toEqual([]);
  });
}
