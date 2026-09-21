import { describe, expect, it } from "vitest";
import { FOREST_THEME, themeBg } from "./theme";

describe("spending palette", () => {
  it("uses semantic colors and valid alpha composition for token values", () => {
    expect(FOREST_THEME.deep).toBe("var(--spending-deep)");
    expect(FOREST_THEME.mid).toBe("var(--spending-mid)");
    expect(themeBg(FOREST_THEME, 0.15)).toBe(
      "color-mix(in srgb, var(--spending-accent) 15%, transparent)",
    );
  });
  it("retains custom palette colors including HSL and hex", () => {
    expect(themeBg({ ...FOREST_THEME, hsl: "hsl(155 32% 26%)" }, 0.5)).toBe(
      "color-mix(in srgb, hsl(155 32% 26%) 50%, transparent)",
    );
    expect(themeBg({ ...FOREST_THEME, hsl: "#123456" }, 0)).toBe(
      "color-mix(in srgb, #123456 0%, transparent)",
    );
  });
});
