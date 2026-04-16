import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "apps", "frontend", "src");

const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

/**
 * Guardrail: taxonomy/category/provider identity checks must use stable IDs/keys,
 * never localized display names (e.g. category.name === "Stock").
 */
const RISK_PATTERNS = [
  {
    label: "category.name equality comparison",
    regex: /\bcategory\.name\s*(===|!==)\s*["'`]/g,
  },
  {
    label: "category.name includes comparison",
    regex: /\bcategory\.name\s*\.\s*includes\s*\(\s*["'`]/g,
  },
  {
    label: "switch on category.name",
    regex: /\bswitch\s*\(\s*category\.name\s*\)/g,
  },
  {
    label: "assignment/category name equality comparison",
    regex: /\b[a-zA-Z0-9_]+\.name\s*(===|!==)\s*["'`](Unknown|Stock|Exchange Traded Fund|Information Technology|Financials)/g,
  },
];

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        files.push(...collectFiles(fullPath));
      }
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`Target directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

const findings = [];
for (const filePath of collectFiles(TARGET_DIR)) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const pattern of RISK_PATTERNS) {
    for (const match of source.matchAll(pattern.regex)) {
      findings.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
        line: lineNumberAt(source, match.index ?? 0),
        label: pattern.label,
        snippet: (match[0] ?? "").trim(),
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Found risky name-based taxonomy/provider logic:");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.label}] ${finding.snippet}`,
    );
  }
  console.error(
    "\nUse stable IDs/keys (e.g. taxonomyId/categoryId/category.key/provider.id) instead of display names.",
  );
  process.exit(1);
}

console.log("No risky name-based taxonomy/provider logic found.");
