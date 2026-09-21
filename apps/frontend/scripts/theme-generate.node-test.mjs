import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { generate, loadThemes, auditContrast } from "./theme-generate.mjs";
import { parseColor, contrast } from "./theme-colors.mjs";

const fixtureCss = await readFile(
  new URL("../src/themes/definitions/flexoki.css", import.meta.url),
  "utf8",
);
const fixture = (await loadThemes()).themes.find(({ id }) => id === "flexoki");
async function workspace(t) {
  const dir = await mkdtemp(resolve(tmpdir(), "wealthfolio-themes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(resolve(dir, "flexoki.css"), fixtureCss);
  return dir;
}
test("discovers CSS themes, scopes selectors and removes deleted themes deterministically", async (t) => {
  const definitionsDir = await workspace(t);
  await writeFile(
    resolve(definitionsDir, "example.css"),
    fixtureCss.replace("@name Flexoki", "@name Example") + "\n:root h1 { letter-spacing: 0; }",
  );
  const options = {
    definitionsDir,
    outputDir: resolve(definitionsDir, "generated"),
    cssPath: resolve(definitionsDir, "public/themes.css"),
  };
  const { themes } = await generate(options);
  assert.deepEqual(
    themes.map(({ id }) => id),
    ["flexoki", "example"],
  );
  const css = await readFile(options.cssPath, "utf8");
  assert.match(css, /:root\[data-theme="example"\] h1/);
  assert.match(css, /:root:not\(\[data-theme\]\)/);
  assert.doesNotMatch(css, /(?:^|\n):root(?:,| \{)/);
  const before = (await stat(options.cssPath)).mtimeMs;
  await generate({ ...options, check: true });
  await generate(options);
  assert.equal((await stat(options.cssPath)).mtimeMs, before);
  await rm(resolve(definitionsDir, "example.css"));
  await assert.rejects(generate({ ...options, check: true }), /stale/);
  await generate(options);
  assert.doesNotMatch(await readFile(options.cssPath, "utf8"), /data-theme="example"/);
});
test("rejects unsafe IDs, duplicate names, missing modes and unsupported CSS", async (t) => {
  const dir = await workspace(t);
  const renamed = fixtureCss.replace("@name Flexoki", "@name Example");
  const cases = [
    ["Bad-ID", renamed, /Unsafe/],
    ["duplicate", fixtureCss, /Duplicate/],
    ["incomplete", renamed.replace(".dark {", ":root {"), /missing standard/],
    ["invalid", renamed + "\n:root { --background: var(--external); }", /Missing color/],
    [
      "cycle",
      renamed + "\n:root { --background: var(--foreground); --foreground: var(--background); }",
      /Circular/,
    ],
    ["import", '@import "https://example.com/a.css";\n' + renamed, /only :root/],
    ["global", renamed + "\nbody { display: none; }", /selectors must/],
    ["url", renamed + "\n:root { --background: url(https://example.com); }", /unsupported/],
  ];
  for (const [id, source, error] of cases) {
    const path = resolve(dir, `${id}.css`);
    await writeFile(path, source);
    await assert.rejects(loadThemes(dir), error);
    await rm(path);
  }
});
test("standard shadcn variables alone receive extension defaults and radius-driven geometry", async (t) => {
  const { standardTokens } = await import("./theme-generate.mjs");
  const dir = await workspace(t);
  const source =
    [
      "/* @name Minimal */",
      ...["light", "dark"].map(
        (mode) =>
          `${mode === "light" ? ":root" : ".dark"} {\n${standardTokens.map((k) => `--${k}: ${fixture[mode][k]};`).join("\n")}\n}`,
      ),
    ].join("\n") + "\n:root { --radius: 0.25rem; }";
  await writeFile(resolve(dir, "minimal.css"), source);
  const theme = (await loadThemes(dir)).themes.find(({ id }) => id === "minimal");
  for (const mode of ["light", "dark"]) {
    assert.equal(theme[mode]["input-bg"], theme[mode].background);
    assert.equal(theme[mode]["toast-bg"], theme[mode].popover);
    assert.equal(theme[mode].gain, theme[mode].success);
    assert.equal(theme.variables[mode].radius, "0.25rem");
    assert.match(theme.variables[mode]["theme-control-radius"], /var\(--radius\)/);
  }
});
test("supports exact extracted colors and reports deficiencies without exemptions", () => {
  for (const mode of ["light", "dark"])
    for (const value of Object.values(fixture[mode])) assert.equal(parseColor(value).length, 4);
  assert.equal(contrast("#000", "#fff"), 21);
  assert.ok(Math.abs(contrast("oklch(0 0 0)", "oklch(1 0 0)") - 21) < 0.01);
  // A deliberately deficient palette proves deficiencies are reported with no
  // exemptions. A shipped theme must not be the fixture for that: the shipped
  // ones are expected to pass, and flexoki now does.
  const deficient = {
    light: { ...fixture.light, "muted-foreground": fixture.light.muted },
    dark: fixture.dark,
  };
  assert.ok(auditContrast([{ id: "deficient", ...deficient }]).some(({ pass }) => !pass));
  assert.ok(auditContrast([{ id: "flexoki", ...fixture }]).every(({ pass }) => pass));
});
test("bootstrap applies cached palette/mode before React and preserves unknown storage", async (t) => {
  const { runInNewContext } = await import("node:vm");
  const definitionsDir = await workspace(t);
  const cssPath = resolve(definitionsDir, "public/themes.css");
  await generate({ definitionsDir, outputDir: resolve(definitionsDir, "generated"), cssPath });
  const script = await readFile(resolve(definitionsDir, "public/theme-bootstrap.js"), "utf8");
  for (const [denied, missingMedia] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    const attrs = {};
    const classes = new Set();
    const root = {
      setAttribute: (k, v) => (attrs[k] = v),
      style: {},
      classList: {
        remove: (...values) => values.forEach((v) => classes.delete(v)),
        add: (v) => classes.add(v),
      },
    };
    runInNewContext(script, {
      document: { documentElement: root },
      window: missingMedia ? {} : { matchMedia: () => ({ matches: true }) },
      localStorage: {
        getItem: (key) => {
          if (denied) throw new Error("denied");
          return key === "wealthfolio-theme-id" ? "future-theme" : null;
        },
        setItem: () => assert.fail("Must not overwrite saved preference"),
      },
    });
    assert.equal(attrs["data-theme"], "flexoki");
    assert.equal(root.style.colorScheme, missingMedia ? "light" : "dark");
    assert.ok(classes.has(missingMedia ? "light" : "dark"));
  }
});
test("OKLCH conversion matches known sRGB red and transparency is restricted only where required", async (t) => {
  const rgb = parseColor("oklch(0.627955 0.257683 29.2339)");
  assert.ok(rgb[0] > 0.999 && rgb[1] < 0.001 && rgb[2] < 0.001);
  assert.deepEqual(parseColor("rgba(255, 0, 0, 0.25)"), [1, 0, 0, 0.25]);
  const dir = await workspace(t);
  for (const token of [
    "card",
    "heatmap-positive-low",
    "heatmap-positive-high",
    "heatmap-negative-low",
    "heatmap-negative-high",
    "heatmap-label-dark",
    "heatmap-label-light",
  ]) {
    await writeFile(
      resolve(dir, "flexoki.css"),
      fixtureCss + `\n:root { --${token}: rgba(255, 0, 0, 0.5); }`,
    );
    await assert.rejects(loadThemes(dir), /must be opaque/);
  }
  await writeFile(
    resolve(dir, "flexoki.css"),
    fixtureCss + "\n:root { --bar-stripe: rgba(255, 0, 0, 0.5); }",
  );
  assert.equal((await loadThemes(dir)).themes.length, 1);
});

test("rejects unsupported HSL and OKLCH bounds before contrast conversion", () => {
  assert.throws(() => parseColor("hsl(30 200% 25%)"), /range/);
  assert.throws(() => parseColor("hsl(30 50% 125%)"), /range/);
  assert.throws(() => parseColor("oklch(1.2 0.1 90)"), /range/);
});

test("checks transparent control states against their actual surface", () => {
  assert.throws(() => contrast("#fff", "rgba(255, 255, 255, .5)"), /opaque/);
  const ratio = contrast("#000", "rgba(255, 255, 255, .5)", "#000");
  assert.ok(Math.abs(ratio - 5.2808) < 0.001);
  assert.throws(() => contrast("#fff", "#000", "rgba(0, 0, 0, .5)"), /canvas must be opaque/);
  const candidate = structuredClone(fixture);
  candidate.dark["destructive-control-foreground"] = "#fff";
  candidate.dark["destructive-control-hover"] = "#f29b91";
  const failed = auditContrast([{ id: "regression", ...candidate }]).filter(
    (result) => result.background === "destructive-control-hover" && result.mode === "dark",
  );
  assert.equal(failed.length, 2);
  assert.ok(failed.every((result) => !result.pass));
});

// Captured from the JSON themes before the CSS migration. Intentional palette
// edits require reviewing and updating the corresponding digest.
// Flexoki's greys, success, warning and dark red were adjusted to clear 4.5:1;
// its destructive controls follow the adjusted red, as legacy parity requires.
test("preserves Flexoki's pre-migration colors in both modes", async () => {
  const { createHash } = await import("node:crypto");
  const expected = {
    flexoki: "c20cb45a31697da5bd80000c189d84a678efaffdf958bf947398783c13117685",
  };
  const { themes, colorTokens } = await loadThemes();
  for (const [id, hash] of Object.entries(expected)) {
    const theme = themes.find((t) => t.id === id);
    assert.ok(theme, id);
    const actual = createHash("sha256")
      .update(
        JSON.stringify(
          ["light", "dark"].map((mode) =>
            colorTokens.map((token) => parseColor(theme[mode][token])),
          ),
        ),
      )
      .digest("hex");
    assert.equal(actual, hash, id);
  }
});
