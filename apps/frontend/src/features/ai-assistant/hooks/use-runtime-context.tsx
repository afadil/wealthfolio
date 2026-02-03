/**
 * Runtime context for sharing the chat runtime across AI assistant components.
 *
 * This allows components like the thread list to access runtime methods
 * for loading threads without prop drilling.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ChatRuntime } from "./use-chat-runtime";

const RuntimeContext = createContext<ChatRuntime | null>(null);

interface RuntimeProviderProps {
  runtime: ChatRuntime;
  children: ReactNode;
}

/**
 * Provider component for runtime context.
 */
export function RuntimeProvider({ runtime, children }: RuntimeProviderProps) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

/**
 * Hook to access the chat runtime.
 * Must be used within a RuntimeProvider.
 */
export function useRuntimeContext(): ChatRuntime {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useRuntimeContext must be used within a RuntimeProvider");
  }
  return context;
}
