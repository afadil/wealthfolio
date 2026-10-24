import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generate, loadThemes, requiredTokens } from "./theme-generate.mjs";

const classic = await readFile(
  new URL("../src/themes/definitions/classic.css", import.meta.url),
  "utf8",
);

// A complete non-base theme: every required role in both modes.
function theme(name, extra = "", { dark = "" } = {}) {
  const roles = requiredTokens.map((token) => `  --${token}: #123456;`).join("\n");
  return `/* @name ${name} */\n:root {\n${roles}\n${extra}\n}\n.dark {\n${roles}\n${dark}\n}\n`;
}

async function workspace(t, files) {
  const dir = await mkdtemp(path.join(tmpdir(), "wealthfolio-themes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "classic.css"), classic);
  for (const [name, source] of Object.entries(files)) await writeFile(path.join(dir, name), source);
  return dir;
}

test("scopes Classic to :root and other themes to their data-theme", async (t) => {
  const dir = await workspace(t, { "example.css": theme("Example") });
  const output = path.join(dir, "out", "themes.css");
  const themes = await generate({ dir, path: output });
  assert.deepEqual(
    themes.map(({ id }) => id),
    ["classic", "example"],
  );
  const css = await readFile(output, "utf8");
  assert.match(css, /^:root \{$/m);
  assert.match(css, /^\.dark \{$/m);
  assert.match(css, /^:root\[data-theme="example"\] \{$/m);
  assert.match(css, /^:root\[data-theme="example"\]\.dark \{$/m);
  await generate({ dir, path: output, check: true });
  await rm(path.join(dir, "example.css"));
  await assert.rejects(generate({ dir, path: output, check: true }), /stale/);
});

test("rejects themes the generator cannot vouch for", async (t) => {
  const cases = [
    ["Bad-ID", theme("Bad"), /Unsafe theme filename/],
    ["duplicate", theme("Classic"), /Duplicate theme name/],
    ["no-dark", theme("No dark").replace(/\.dark \{[^}]*\}/, ".dark {}"), /missing required/],
    ["typo", theme("Typo", "  --backgruond: #fff;"), /Classic does not define --backgruond/],
    ["selector", theme("Selector") + "body { color: red; }", /only :root and \.dark/],
    ["import", '@import "https://example.com/a.css";\n' + theme("Import"), /only :root/],
    ["url", theme("Url", "  --background: url(https://example.com);"), /unsupported/],
    ["important", theme("Important", "  --background: #fff !important;"), /unsupported/],
    ["font-route", theme("Route", "  --font-sans: var(--font-mono);"), /route it to --font-mono/],
  ];
  for (const [id, source, error] of cases) {
    const dir = await workspace(t, { [`${id}.css`]: source });
    await assert.rejects(loadThemes(dir), error, id);
  }
});

test("font stacks keep Rubik Arabic ahead of fonts that draw Arabic", async (t) => {
  const stack = (value) => theme("Fonts", `  --font-sans: ${value};`);
  const accepted = [
    '"Inter Variable", "Inter", "Rubik Arabic", ui-sans-serif, system-ui, sans-serif',
    '"Rubik Arabic", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  ];
  for (const value of accepted) {
    const dir = await workspace(t, { "fonts.css": stack(value) });
    await loadThemes(dir);
  }
  const rejected = [
    // Without Rubik, Arabic falls back to a system font.
    '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif',
    // A system font before Rubik draws Arabic itself.
    '-apple-system, "Rubik Arabic", system-ui, sans-serif',
    // A sans role must still end with a sans generic.
    '"Inter", "Rubik Arabic", serif',
  ];
  for (const value of rejected) {
    const dir = await workspace(t, { "fonts.css": stack(value) });
    await assert.rejects(loadThemes(dir), /--font-sans must/, value);
  }
  // Dark mode inherits a light stack, and a stack reached through a helper
  // variable is checked too.
  const dir = await workspace(t, {
    "fonts.css": theme("Fonts", "  --chart-stone: #000;", {
      dark: '  --chart-stone: "Inter", serif;\n  --font-serif: var(--chart-stone);',
    }),
  });
  await assert.rejects(loadThemes(dir), /fonts\/dark: --font-serif must list "Rubik Arabic"/);
});

test("the committed themes are valid and the output is current", async () => {
  const themes = await generate({ check: true });
  assert.equal(themes[0].id, "classic");
  assert.equal(themes.length, 1);
});
