#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenvFile(file) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  const content = readFileSync(p, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Load .env.web if present
loadDotenvFile(".env.web");

const children = new Map();
let exiting = false;

function spawnNamed(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
  children.set(name, child);
  child.on("exit", (code, signal) => {
    if (exiting) return;
    exiting = true;
    // Terminate others
    for (const [n, c] of children.entries()) {
      if (c.pid && n !== name) {
        try {
          process.kill(c.pid, "SIGTERM");
        } catch (e) {
          // ignore process kill errors during shutdown
          void e;
        }
      }
    }
    // Give them a moment to exit, then force kill
    setTimeout(() => {
      for (const [n, c] of children.entries()) {
        if (c.pid && n !== name) {
          try {
            process.kill(c.pid, "SIGKILL");
          } catch (e) {
            // ignore force kill errors
            void e;
          }
        }
      }
      process.exit(code === null ? (signal ? 128 : 1) : code);
    }, 500);
  });
  return child;
}

function shutdownAndExit(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const [, c] of children.entries()) {
    if (c.pid) {
      try {
        process.kill(c.pid, "SIGTERM");
      } catch (e) {
        // ignore process kill errors during shutdown
        void e;
      }
    }
  }
  setTimeout(() => {
    for (const [, c] of children.entries()) {
      if (c.pid) {
        try {
          process.kill(c.pid, "SIGKILL");
        } catch (e) {
          // ignore force kill errors
          void e;
        }
      }
    }
    process.exit(code);
  }, 500);
}

process.on("SIGINT", () => shutdownAndExit(130));
process.on("SIGTERM", () => shutdownAndExit(143));

// Start backend and Vite
spawnNamed("server", "cargo", ["run", "--manifest-path", "src-server/Cargo.toml"]);
spawnNamed("vite", "vite", []);
