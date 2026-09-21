import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import postcss from "postcss";
import { contrast, parseColor } from "./theme-colors.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = resolve(frontend, "../../packages/ui/src/theme-tokens.json");
export const contrastPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["toast-fg", "toast-bg"],
  ["toast-success-fg", "toast-success-bg"],
  ["toast-error-fg", "toast-error-bg"],
  ["toast-warning-fg", "toast-warning-bg"],
  ["toast-info-fg", "toast-info-bg"],
  ["gain", "background"],
  ["loss", "background"],
  ["flat", "background"],
  ...["background", "card"].flatMap((canvas) =>
    ["destructive-control", "destructive-control-hover"].map((background) => [
      "destructive-control-foreground",
      background,
      canvas,
    ]),
  ),
];
const defaultsPath = resolve(frontend, "src/themes/defaults.css");
const shapeRulesPath = resolve(frontend, "src/themes/shapes.css");
export const standardTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

// Deliberately limited to theme variables and root-scoped component refinements.
// Imports, arbitrary global selectors and nested rules are not theme inputs.
function readThemeCss(source, filename) {
  const root = postcss.parse(source, { from: filename });
  const modes = { light: {}, dark: {} };
  const rules = [];
  root.each((node) => {
    if (node.type === "comment") return;
    if (node.type !== "rule")
      throw new Error(`${filename}: only :root and .dark rules are supported`);
    const selectors = postcss.list.comma(node.selector);
    if (selectors.some((selector) => !/^(?::root(?:\.dark)?|\.dark)(?:$|\s)/.test(selector)))
      throw new Error(`${filename}: selectors must start with :root or .dark`);
    const variables = selectors.every((selector) =>
      [":root", ".dark", ":root.dark"].includes(selector),
    );
    node.each((decl) => {
      if (decl.type === "comment") return;
      if (decl.type !== "decl" || decl.important || /url\s*\(|expression\s*\(/i.test(decl.value))
        throw new Error(`${filename}: unsupported theme declaration`);
      if (variables) {
        if (!/^--[a-z][a-z0-9-]*$/.test(decl.prop))
          throw new Error(`${filename}: root rules may only contain custom properties`);
        for (const selector of selectors)
          modes[selector === ":root" ? "light" : "dark"][decl.prop.slice(2)] = decl.value;
      }
    });
    if (!variables) rules.push(node.toString());
  });
  return { modes, rules };
}

function resolveColor(token, values, path = []) {
  if (path.includes(token))
    throw new Error(`Circular color reference: ${[...path, token].join(" -> ")}`);
  const value = values[token];
  if (value === undefined) throw new Error(`Missing color variable --${token}`);
  const alias = /^var\(--([a-z][a-z0-9-]*)\)$/.exec(value);
  return alias ? resolveColor(alias[1], values, [...path, token]) : value;
}

export async function loadThemes(definitionsDir = resolve(frontend, "src/themes/definitions")) {
  const { modes: defaults } = readThemeCss(await readFile(defaultsPath, "utf8"), defaultsPath);
  const { colorTokens } = JSON.parse(await readFile(contractPath, "utf8"));
  const themes = [];
  const names = new Set();
  for (const filename of (await readdir(definitionsDir))
    .filter((name) => name.endsWith(".css"))
    .sort()) {
    const id = filename.slice(0, -4);
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length > 48)
      throw new Error(`Unsafe theme filename: ${filename}`);
    const source = await readFile(resolve(definitionsDir, filename), "utf8");
    const name = /\/\*\s*@name\s+([^*]+)\*\//.exec(source)?.[1].trim() ?? id;
    if (
      !name ||
      name.length > 60 ||
      /[<>]/.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error(`${id}: invalid theme name`);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate theme name: ${name}`);
    names.add(name.toLowerCase());
    const { modes, rules } = readThemeCss(source, filename);
    const theme = { id, name, shape: id, light: {}, dark: {}, variables: {}, rules };
    for (const mode of ["light", "dark"]) {
      const missing = standardTokens.filter((token) => !Object.hasOwn(modes[mode], token));
      if (missing.length)
        throw new Error(`${id}/${mode}: missing standard tokens: ${missing.join(", ")}`);
      const values = {
        ...defaults.light,
        ...(mode === "dark" ? defaults.dark : {}),
        ...modes.light,
        ...(mode === "dark" ? modes.dark : {}),
      };
      for (const token of colorTokens) {
        try {
          const value = resolveColor(token, values);
          const rgba = parseColor(value);
          if (
            (token === "card" ||
              /^heatmap-(?:positive|negative)-(?:low|high)$/.test(token) ||
              /^heatmap-label-(?:dark|light)$/.test(token)) &&
            rgba[3] !== 1
          )
            throw new Error("Chart interpolation and label colors must be opaque");
          theme[mode][token] = value;
        } catch (error) {
          throw new Error(`${id}/${mode}/${token}: ${error.message}`);
        }
      }
      theme.variables[mode] = { ...values, ...theme[mode] };
    }
    themes.push(theme);
  }
  if (!themes.some(({ id }) => id === "flexoki"))
    throw new Error("Required fallback theme flexoki is missing");
  themes.sort((a, b) => (a.id === "flexoki" ? -1 : b.id === "flexoki" ? 1 : a.id < b.id ? -1 : 1));
  return { themes, colorTokens };
}
export function auditContrast(themes) {
  return themes.flatMap((theme) =>
    ["light", "dark"].flatMap((mode) =>
      contrastPairs.map(([foreground, background, canvas]) => {
        const ratio = contrast(
          theme[mode][foreground],
          theme[mode][background],
          canvas ? theme[mode][canvas] : undefined,
        );
        return {
          theme: theme.id,
          mode,
          foreground,
          background,
          ...(canvas ? { canvas } : {}),
          ratio: Number(ratio.toFixed(3)),
          minimum: 4.5,
          pass: ratio >= 4.5,
        };
      }),
    ),
  );
}
export async function generate({
  definitionsDir,
  outputDir = resolve(frontend, "src/themes/generated"),
  cssPath = resolve(frontend, "public/themes.css"),
  check = false,
} = {}) {
  const { themes, colorTokens } = await loadThemes(definitionsDir);
  const shapeRules = await readFile(shapeRulesPath, "utf8");
  const audit = auditContrast(themes);
  const css =
    "/* Generated by scripts/theme-generate.mjs. Do not edit. */\n" +
    themes
      .flatMap((theme) =>
        ["light", "dark"].map((mode) => {
          const selectors = [
            theme.id === "flexoki"
              ? mode === "dark"
                ? ":root:not([data-theme]).dark"
                : ":root:not([data-theme])"
              : null,
            `:root[data-theme="${theme.id}"]${mode === "dark" ? ".dark" : ":not(.dark)"}`,
          ]
            .filter(Boolean)
            .join(", ");
          return `${selectors} {\n${Object.entries(theme.variables[mode])
            .map(([token, value]) => `  --${token}: ${value};`)
            .join("\n")}\n}`;
        }),
      )
      .join("\n\n") +
    "\n" +
    shapeRules +
    "\n" +
    themes
      .flatMap((theme) =>
        theme.rules.map((rule) => {
          const parsed = postcss.parse(rule);
          parsed.walkRules((node) => {
            node.selector = postcss.list
              .comma(node.selector)
              .map((selector) =>
                selector.replace(
                  /^(?::root\.dark|\.dark|:root)/,
                  (prefix) =>
                    `:root[data-theme="${theme.id}"]${prefix.includes(".dark") ? ".dark" : ""}`,
                ),
              )
              .join(", ");
          });
          return parsed.toString();
        }),
      )
      .join("\n");
  const registryThemes = themes.map(({ id, name, shape, light, dark, variables }) => ({
    id,
    name,
    shape,
    light,
    dark,
    variables: Object.fromEntries(
      Object.entries(variables).map(([mode, values]) => [
        mode,
        Object.fromEntries(
          Object.entries(values).filter(([token]) => !colorTokens.includes(token)),
        ),
      ]),
    ),
  }));
  const ts = `// Generated by scripts/theme-generate.mjs. Do not edit.\nexport type ThemeColorToken = ${colorTokens.map((token) => JSON.stringify(token)).join(" | ")};\nexport interface ThemeDefinition { id: string; name: string; shape: ${themes.map(({ id }) => JSON.stringify(id)).join(" | ")}; light: Record<ThemeColorToken, string>; dark: Record<ThemeColorToken, string>; variables: Record<"light" | "dark", Record<string, string>>; }\nexport const themes: ThemeDefinition[] = ${JSON.stringify(registryThemes, null, 2)};\nexport function isThemeId(value: unknown): value is string { return typeof value === "string" && themes.some((theme) => theme.id === value); }\nexport function resolveThemeId(value: unknown): string { return isThemeId(value) ? value : "flexoki"; }\n`;
  const bootstrap = `// Generated by scripts/theme-generate.mjs. Do not edit.
(function () {
  var ids = ${JSON.stringify(themes.map(({ id }) => id))};
  var savedId, mode, font;
  try { savedId = localStorage.getItem("wealthfolio-theme-id"); mode = localStorage.getItem("wealthfolio-theme"); font = localStorage.getItem("wealthfolio-font"); } catch (_) {}
  var root = document.documentElement;
  var dark = mode === "dark" || ((mode == null || mode === "system") && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", ids.indexOf(savedId) >= 0 ? savedId : "flexoki");
  root.classList.remove("light", "dark"); root.classList.add(dark ? "dark" : "light");
  root.style.colorScheme = dark ? "dark" : "light";
  if (document.body && ["font-mono", "font-sans", "font-serif"].indexOf(font) >= 0) { document.body.classList.remove("font-mono", "font-sans", "font-serif"); document.body.classList.add(font); }
})();
`;
  for (const [path, source] of [
    [resolve(dirname(cssPath), "theme-bootstrap.js"), bootstrap],
    [cssPath, css],
    [resolve(outputDir, "registry.ts"), ts],
    [resolve(outputDir, "contrast-report.json"), JSON.stringify(audit, null, 2) + "\n"],
  ]) {
    const content = await format(source, {
      ...(await resolveConfig(resolve(frontend, "../../.prettierrc.cjs"))),
      filepath: path,
    });
    const current = await readFile(path, "utf8").catch(() => undefined);
    if (current === content) continue;
    if (check) throw new Error(`Generated theme output is stale: ${path}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return { themes, failures: audit.filter((result) => !result.pass) };
}
async function run() {
  const result = await generate({ check: process.argv.includes("--check") });
  if (result.failures.length) {
    console.error(
      "Theme contrast deficiencies (4.5:1 normal text; no baseline exemptions):\n" +
        result.failures
          .map((r) => `${r.theme}/${r.mode} ${r.foreground} on ${r.background}: ${r.ratio}`)
          .join("\n"),
    );
    if (process.argv.includes("--contrast")) process.exitCode = 1;
  }
  console.log(`Validated ${result.themes.length} theme definitions.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  if (process.argv.includes("--watch") && !process.exitCode) {
    const watchers = [];
    const stop = () => {
      clearTimeout(timer);
      watchers.forEach((watcher) => watcher.close());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    let timer;
    for (const path of [
      resolve(frontend, "src/themes/definitions"),
      contractPath,
      defaultsPath,
      shapeRulesPath,
    ])
      watchers.push(
        watch(path, () => {
          clearTimeout(timer);
          timer = setTimeout(
            () =>
              run().catch((error) => {
                console.error(error.message);
                process.exitCode = 1;
                stop();
              }),
            100,
          );
        }),
      );
  }
}
