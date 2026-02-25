import { constants } from "node:fs";
import { access, copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const tauriDir = path.resolve(scriptDir, "..");

  const sourceComposerIcon = path.join(tauriDir, "icons", "AppIcon.icon");
  const sourceMasterIcon = path.join(tauriDir, "icons", "icon.png");
  const sourceIosIconsDir = path.join(tauriDir, "icons", "ios");

  const generatedComposerIconDir = path.join(tauriDir, "gen", "apple", "AppIcon.icon");
  const composerAssetDir = path.join(tauriDir, "gen", "apple", "AppIcon.icon", "Assets");
  const composerLogo = path.join(composerAssetDir, "logo-vector.png");

  const generatedAppIconSetDir = path.join(
    tauriDir,
    "gen",
    "apple",
    "Assets.xcassets",
    "AppIcon.appiconset",
  );

  const hasComposerSource = await exists(sourceComposerIcon);

  if (hasComposerSource) {
    await rm(generatedComposerIconDir, { recursive: true, force: true });
    await cp(sourceComposerIcon, generatedComposerIconDir, { recursive: true, force: true });
  } else if (await exists(sourceMasterIcon)) {
    if (await exists(composerAssetDir)) {
      await mkdir(composerAssetDir, { recursive: true });
      await copyFile(sourceMasterIcon, composerLogo);
    }
  }

  if (!hasComposerSource && (await exists(sourceIosIconsDir)) && (await exists(generatedAppIconSetDir))) {
    const files = await readdir(sourceIosIconsDir);
    for (const file of files.filter((file) => file.endsWith(".png"))) {
      await copyFile(path.join(sourceIosIconsDir, file), path.join(generatedAppIconSetDir, file));
    }
  }
}

await main();
