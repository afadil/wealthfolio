import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const tickerLogosDir = path.resolve(currentDir, "../../public/ticker-logos");

/**
 * Windows resolves these names to character devices rather than files, whatever
 * extension follows them, so `CON.png` is the console and not a logo. Git for
 * Windows refuses to write such a path while `core.protectNTFS` is on — its
 * default — and refuses the whole checkout with it, so one such file leaves
 * `git clone` reporting `unable to checkout working tree` and an empty tree.
 */
const RESERVED_DEVICE_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 10 }, (_, index) => `COM${index}`),
  ...Array.from({ length: 10 }, (_, index) => `LPT${index}`),
]);

function collectFilenames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory()
      ? collectFilenames(entryPath)
      : [path.relative(tickerLogosDir, entryPath)];
  });
}

describe("bundled ticker logos", () => {
  it("uses no filename Windows reserves for a device", () => {
    const reserved = collectFilenames(tickerLogosDir).filter((filename) => {
      const baseName = path.basename(filename).split(".")[0];
      return RESERVED_DEVICE_NAMES.has(baseName.toUpperCase());
    });

    // A ticker whose logo cannot ship is one missing avatar; the fallback in
    // `resolveTickerLogoFilenames` already covers it. A repository that cannot
    // be cloned on Windows costs every Windows contributor the whole checkout.
    expect(reserved).toEqual([]);
  });
});
