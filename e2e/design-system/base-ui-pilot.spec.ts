import { test, expect } from "@playwright/test";
for (const width of [1280, 390]) {
  test.describe(`Base pilot ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/e2e/base-ui-pilot/");
    });
    test("search, keyboard selection, duplicate labels, clear and form submit", async ({
      page,
    }) => {
      const input = page.getByRole("combobox", { name: "Account", exact: true });
      await input.fill("Retire");
      await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229 });
      await expect(page.getByLabel("Selected account", { exact: true })).toHaveText("none");

      await input.press("ArrowDown");
      await input.press("Enter");
      await expect(page.getByLabel("Selected account", { exact: true })).toHaveText("rrsp");
      await expect(page.getByLabel("Submit count")).toHaveText("0");
      await page.getByRole("button", { name: "Clear Account", exact: true }).click();
      await expect(page.getByLabel("Selected account", { exact: true })).toHaveText("none");
      await input.fill("Investment");
      await page.getByRole("option", { name: "Investmentjoint" }).click();
      await expect(page.getByLabel("Selected account", { exact: true })).toHaveText("joint");
      await page.getByRole("button", { name: "Submit account", exact: true }).click();
      await expect(page.getByLabel("Submit count")).toHaveText("1");
      await input.fill("no matches");
      await expect(page.getByText("No accounts found")).toBeVisible();
      await page.getByText("Outside target", { exact: true }).click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
    });
    test("dialog IME Escape, dismissal and trigger focus", async ({ page }) => {
      const trigger = page.getByRole("button", { name: "Open Base dialog" });
      await trigger.click();
      const note = page.getByRole("textbox", { name: "Base note" });
      await expect(note).toBeFocused();
      await note.dispatchEvent("compositionstart");
      await note.dispatchEvent("keydown", { key: "Escape", isComposing: true, keyCode: 229 });
      await expect(page.getByRole("dialog", { name: "Base dialog", exact: true })).toBeVisible();
      await note.dispatchEvent("compositionend");
      await note.press("Escape");
      await expect(page.getByRole("dialog", { name: "Base dialog", exact: true })).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.mouse.click(5, 5);
      await expect(page.getByRole("dialog", { name: "Base dialog", exact: true })).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
    test("selector inside existing Radix Sheet and editable grid", async ({ page }) => {
      await page.getByRole("button", { name: "Open Radix sheet" }).click();
      await page.getByRole("combobox", { name: "Sheet account", exact: true }).fill("Cash");
      await page.getByRole("option", { name: "Cash reservecash" }).click();
      await expect(page.getByRole("dialog", { name: "Mixed library sheet" })).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("combobox", { name: "Grid account", exact: true }).fill("Retire");
      await page.getByRole("option", { name: "Retirementrrsp" }).click();
      await expect(page.getByLabel("Grid result")).toContainText('"account":"rrsp"');
      await page.getByRole("button", { name: "Editable note", exact: true }).click();
      await page.getByRole("button", { name: "Editable note", exact: true }).press("Enter");
      const editor = page.locator("textarea");
      await expect(editor).toBeFocused();
      await editor.fill("Preserved edit");
      await editor.press("Tab");
      await expect(page.getByLabel("Grid result")).toContainText("Preserved edit");
    });
  });
}
