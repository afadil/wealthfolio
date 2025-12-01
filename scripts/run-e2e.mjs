import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { prepE2eEnv } from "./prep-e2e.mjs";

const DEV_SERVER_URL = process.env.WF_E2E_BASE_URL || "http://localhost:1420";
const cliArgs = process.argv.slice(2);
const shouldUseUi = cliArgs.includes("--ui");

const buildHealthUrl = (base, path = "/") =>
  new URL(path, `${base.replace(/\/$/, "")}/`).toString();

const waitForServer = async (url, serverProcess, { timeout = 60_000, interval = 500 } = {}) => {
  const deadline = Date.now() + timeout;
  const healthUrl = buildHealthUrl(url);

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Dev server exited prematurely with code ${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(healthUrl, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch (error) {
      // continue until service responds
    }

    await setTimeout(interval);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const spawnCommand = (command, args) => spawn(command, args, { stdio: "inherit" });

const runPlaywrightTests = (extraArgs = []) =>
  new Promise((resolve, reject) => {
    const tests = spawnCommand("pnpm", ["exec", "playwright", "test", ...extraArgs]);
    tests.once("error", reject);
    tests.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Playwright exited with code ${code}`));
      }
    });
  });

const run = async () => {
  await prepE2eEnv();

  const devServer = spawnCommand("pnpm", ["run", "dev:web"]);

  const cleanup = async () => {
    if (devServer.exitCode === null && !devServer.killed) {
      devServer.kill("SIGINT");
      await once(devServer, "exit");
    }
  };

  const handleSignal = () => {
    cleanup().catch(() => {});
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  process.once("exit", handleSignal);

  try {
    await waitForServer(DEV_SERVER_URL, devServer);
    await runPlaywrightTests(cliArgs);
  } finally {
    await cleanup();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
