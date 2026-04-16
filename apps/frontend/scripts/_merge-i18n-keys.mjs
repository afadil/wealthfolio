import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locale = process.argv[2];
if (!locale || !["en", "de"].includes(locale)) {
  console.error("Usage: node _merge-i18n-keys.mjs en|de");
  process.exit(1);
}
const base = path.join(__dirname, "../src/i18n/locales", locale);
const commonPath = path.join(base, "common.json");
const extraPath = path.join(base, `_keys_${locale}.json`);
const j = JSON.parse(fs.readFileSync(commonPath, "utf8"));
const extra = JSON.parse(fs.readFileSync(extraPath, "utf8"));
Object.assign(j, extra);
fs.writeFileSync(commonPath, JSON.stringify(j, null, 2) + "\n");
fs.unlinkSync(extraPath);
console.log("Merged", Object.keys(extra).length, "keys into", locale, "common.json");
