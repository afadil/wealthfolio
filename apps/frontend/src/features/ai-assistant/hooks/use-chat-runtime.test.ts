import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../types";
import { convertToExternalMessage } from "./use-chat-runtime";

vi.mock("@/adapters", () => ({}));
vi.mock("@/hooks", () => ({}));
vi.mock("../api", () => ({}));

describe("convertToExternalMessage", () => {
  it("shows a saved reply cut off by a provider error with its error", () => {
    const message: ChatMessage = {
      id: "message",
      threadId: "thread",
      role: "assistant",
      createdAt: "2026-10-18T00:00:00Z",
      content: {
        schemaVersion: 1,
        parts: [
          { type: "text", content: "Checking your accounts." },
          { type: "toolCall", toolCallId: "call", name: "get_accounts", arguments: {} },
          { type: "toolResult", toolCallId: "call", success: true, data: [] },
          { type: "text", content: "You have one" },
          { type: "error", code: "STREAM_ERROR", message: "Rate limit (429)" },
        ],
      },
    };

    const parts = convertToExternalMessage(message).parts;

    expect(parts.map((part) => part.type)).toEqual(["text", "toolCall", "text", "text"]);
    expect(parts[1]).toMatchObject({ toolCallId: "call", result: [] });
    const error = parts[3];
    expect(error?.type === "text" && error.content).toContain("**Rate limit exceeded**");
  });
});
