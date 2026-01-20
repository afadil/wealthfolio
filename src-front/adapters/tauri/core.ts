// Core utilities for Tauri adapter - internal use only
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

import type { Logger } from "../types";

/**
 * Logger implementation using Tauri's log plugin
 * Wraps the Tauri log functions to match the Logger interface
 */
export const logger: Logger = {
  error: (...args: unknown[]) => {
    error(args.map(String).join(" "));
  },
  warn: (...args: unknown[]) => {
    warn(args.map(String).join(" "));
  },
  info: (...args: unknown[]) => {
    info(args.map(String).join(" "));
  },
  debug: (...args: unknown[]) => {
    debug(args.map(String).join(" "));
  },
  trace: (...args: unknown[]) => {
    trace(args.map(String).join(" "));
  },
};

/**
 * Invoke a Tauri command (internal - use typed adapter functions instead)
 */
export const invoke = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  try {
    return await tauriInvoke<T>(command, payload);
  } catch (err) {
    logger.error(`[Invoke] Command "${command}" failed: ${err}`);
    throw err;
  }
};

// Re-export tauriInvoke for cases where we need direct access (e.g., Channel streaming)
export { tauriInvoke };

// Platform detection flags for shared modules
export const isDesktop = true;
export const isWeb = false;
