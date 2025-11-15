import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.web");

const pad = (value) => String(value).padStart(2, "0");

const getTimestamp = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
};

const replaceDbPath = (content, timestamp) => {
  if (!content.includes("WF_DB_PATH=")) {
    throw new Error("WF_DB_PATH entry not found in .env.web");
  }

  return content.replace(
    /^WF_DB_PATH=.*$/m,
    `WF_DB_PATH=./db/app-testing-${timestamp}.db`,
  );
};

export const prepE2eEnv = async () => {
  const content = await readFile(ENV_PATH, "utf8");
  const timestamp = getTimestamp();
  const updated = replaceDbPath(content, timestamp);

  if (content === updated) {
    console.log("WF_DB_PATH already set for this run, no update required.");
    return;
  }

  await writeFile(ENV_PATH, updated);
  console.log(`Updated .env.web to use ./db/app-testing-${timestamp}.db`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepE2eEnv();
}
