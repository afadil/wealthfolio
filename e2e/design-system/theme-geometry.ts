import type { Page } from "@playwright/test";

/** Resolve role tokens independently of the component under test. */
export async function readThemeGeometry(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.append(probe);
    const radius = (value: string) => {
      probe.style.borderRadius = value;
      return getComputedStyle(probe).borderTopLeftRadius;
    };
    const geometry = {
      control: radius("var(--theme-control-radius, calc(var(--radius) - 2px))"),
      button: radius("var(--theme-button-radius, var(--theme-control-radius, 9999px))"),
      segmented: radius("var(--theme-segmented-radius, 9999px)"),
      card: radius("var(--theme-card-radius, var(--radius))"),
      sheet: radius("var(--theme-dialog-radius, 0px)"),
      confirmation: radius(
        `var(--theme-dialog-radius, ${innerWidth < 640 ? "1.5rem" : "var(--radius)"})`,
      ),
      dialog: radius(`var(--theme-dialog-radius, ${innerWidth < 768 ? "2rem" : "var(--radius)"})`),
    };
    probe.style.height = "var(--theme-control-height, 2.75rem)";
    probe.style.display = "block";
    const height = innerWidth < 768 ? "44px" : getComputedStyle(probe).height;
    probe.remove();
    return { ...geometry, height };
  });
}
