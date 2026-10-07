// Ratchet for colours that bypass the theme: raw Tailwind palette classes and
// hex literals in app source. Per-file counts may only fall. After removing
// some, run `pnpm colors:check --update` to lower the baseline.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(frontend, "src");
const baselinePath = resolve(frontend, "scripts/raw-color-baseline.json");
const palette =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|caret|accent|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
const hex = /#(?:[\da-f]{8}|[\da-f]{6})\b/gi;
const skipped = /(?:\.test\.tsx?$|\/__tests__\/|^test\/|^themes\/generated\/)/;

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

export async function countRawColors() {
  const counts = {};
  for (const path of await sourceFiles(sourceDir)) {
    const file = relative(sourceDir, path).split("\\").join("/");
    if (skipped.test(file)) continue;
    const source = await readFile(path, "utf8");
    const count = (source.match(palette)?.length ?? 0) + (source.match(hex)?.length ?? 0);
    if (count) counts[file] = count;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function run() {
  const counts = await countRawColors();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (process.argv.includes("--update")) {
    await writeFile(baselinePath, JSON.stringify(counts, null, 2) + "\n");
    console.log(`Raw colour baseline set to ${total} in ${Object.keys(counts).length} files.`);
    return;
  }
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const grown = [];
  const shrunk = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(counts)])) {
    const before = baseline[file] ?? 0;
    const now = counts[file] ?? 0;
    if (now > before) grown.push(`${file}: ${before} -> ${now}`);
    else if (now < before) shrunk.push(`${file}: ${before} -> ${now}`);
  }
  if (grown.length) {
    console.error(
      "New raw colours bypass the theme. Use a theme token class instead " +
        "(for example text-gain, text-loss, text-warning, bg-muted):\n" +
        grown.join("\n"),
    );
    process.exitCode = 1;
  }
  if (shrunk.length) {
    console.error(
      "Raw colours were removed. Lock in the improvement with `pnpm colors:check --update`:\n" +
        shrunk.join("\n"),
    );
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Raw colours: ${total}, no increase.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
