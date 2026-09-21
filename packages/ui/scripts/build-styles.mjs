import { copyFile, mkdir } from "node:fs/promises";

// Published stylesheet is Tailwind v4 source; consumers compile it with their app.
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
for (const name of ["styles.css", "theme-mapping.css"]) {
  await copyFile(
    new URL(`../src/${name}`, import.meta.url),
    new URL(`../dist/${name}`, import.meta.url),
  );
}
