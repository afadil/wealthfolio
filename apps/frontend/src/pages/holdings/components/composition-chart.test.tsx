import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTreemapColor,
  getTreemapPaletteSnapshot,
  subscribeToTreemapTheme,
} from "./composition-chart";

vi.mock("@/lib/settings-provider", () => ({ useSettingsContext: vi.fn() }));

const palette = {
  positiveLow: [205, 217, 191],
  positiveHigh: [53, 92, 76],
  negativeLow: [233, 179, 168],
  negativeHigh: [209, 78, 66],
  labelDark: [28, 42, 36],
  labelLight: [245, 243, 236],
  surface: [29, 28, 27],
  isDark: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove("dark");
});

describe("treemap theme preservation", () => {
  it("preserves daily and total saturation and zero/unavailable fill", () => {
    expect(getTreemapColor(0, "daily", palette).fill).toBe("rgb(205,217,191)");
    expect(getTreemapColor(NaN, "daily", palette).fill).toBe("rgb(205,217,191)");
    expect(getTreemapColor(0.025, "daily", palette).fill).toBe("rgb(129,155,134)");
    expect(getTreemapColor(0.5, "return", palette).fill).toBe("rgb(129,155,134)");
    expect(getTreemapColor(-0.0125, "daily", palette).fill).toBe("rgb(221,129,117)");
    expect(getTreemapColor(-0.25, "pnl", palette).fill).toBe("rgb(221,129,117)");
  });

  it.each([false, true])(
    "chooses readable text over composited extreme and zero tiles (dark=%s)",
    (isDark) => {
      for (const value of [-1e9, 0, 1e9]) {
        const tile = getTreemapColor(value, "return", { ...palette, isDark });
        expect(tile.contrast).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("uses a neutral label when both curated labels fail normal-text contrast", () => {
    expect(getTreemapColor(-1e9, "return", palette).textColor).toBe("rgb(0,0,0)");
  });

  it("refreshes colors on same-mode palette switches and keeps snapshot identity stable", async () => {
    let fillStyle = "";
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      getImageData: () => ({
        data: new Uint8ClampedArray(
          fillStyle === "#112233" ? [17, 34, 51, 255] : [51, 68, 85, 255],
        ),
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    document.documentElement.dataset.theme = "first";
    document.documentElement.style.setProperty("--heatmap-positive-low", "#112233");
    const first = getTreemapPaletteSnapshot();
    expect(getTreemapPaletteSnapshot()).toBe(first);
    expect(first.positiveLow).toEqual([17, 34, 51]);
    const changed = vi.fn();
    const unsubscribe = subscribeToTreemapTheme(changed);
    document.documentElement.dataset.theme = "second";
    document.documentElement.style.setProperty("--heatmap-positive-low", "#334455");
    await Promise.resolve();
    expect(changed).toHaveBeenCalled();
    const next = getTreemapPaletteSnapshot();
    expect(next).not.toBe(first);
    expect(next.isDark).toBe(false);
    expect(next.positiveLow).toEqual([51, 68, 85]);
    unsubscribe();
  });
});
