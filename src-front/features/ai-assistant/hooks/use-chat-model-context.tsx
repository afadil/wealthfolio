/**
 * Chat model context for sharing model selection and thinking state across AI assistant components.
 *
 * This ensures that ThinkingToggle and ChatShell share the same thinkingEnabled state,
 * so toggling actually affects the config sent to the backend.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useChatModel, type ChatModelState } from "./use-chat-model";

const ChatModelContext = createContext<ChatModelState | null>(null);

interface ChatModelProviderProps {
  children: ReactNode;
}

/**
 * Provider component for chat model context.
 * Wraps the useChatModel hook state and shares it with all children.
 */
export function ChatModelProvider({ children }: ChatModelProviderProps) {
  const chatModelState = useChatModel();

  return (
    <ChatModelContext.Provider value={chatModelState}>
      {children}
    </ChatModelContext.Provider>
  );
}

/**
 * Hook to access the shared chat model state.
 * Must be used within a ChatModelProvider.
 */
export function useChatModelContext(): ChatModelState {
  const context = useContext(ChatModelContext);
  if (!context) {
    throw new Error("useChatModelContext must be used within a ChatModelProvider");
  }
  return context;
}
