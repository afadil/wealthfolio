export type Palette = {
  key: string;
  label: string;
  hsl: string;
  deep: string;
  mid: string;
};

export const FOREST_THEME: Palette = {
  key: "forest",
  label: "Forest",
  hsl: "var(--spending-accent)",
  deep: "var(--spending-deep)",
  mid: "var(--spending-mid)",
};

export const themeBg = (p: Palette, alpha: number): string =>
  `color-mix(in srgb, ${p.hsl} ${alpha * 100}%, transparent)`;
