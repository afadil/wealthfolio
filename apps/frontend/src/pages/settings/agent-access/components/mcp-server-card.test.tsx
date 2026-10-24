import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpServerCard } from "./mcp-server-card";

vi.mock("@wealthfolio/ui/components/ui/use-toast", () => ({ toast: vi.fn() }));

const idle = { isPending: false, mutate: vi.fn() };
vi.mock("../hooks/use-mcp-server", () => ({
  useMcpServer: () => ({
    status: { enabled: true, running: true, port: 8639, autoStart: false, auditEnabled: true },
    isLoading: false,
    isError: false,
    refetchStatus: vi.fn(),
    setAutoStartMutation: idle,
    startMutation: idle,
    stopMutation: idle,
    setAuditEnabledMutation: idle,
  }),
}));

describe("McpServerCard help", () => {
  beforeEach(() => {
    // Radix Select needs these pointer APIs, which jsdom lacks.
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("switches the setup snippet between Claude Code, Codex and other apps", async () => {
    const user = userEvent.setup();
    render(<McpServerCard />);

    fireEvent.click(screen.getByRole("button", { name: "How to connect a client" }));

    expect(
      await screen.findByText(
        'claude mcp add --scope user --transport http wealthfolio http://127.0.0.1:8639/mcp --header "Authorization: Bearer YOUR_TOKEN"',
      ),
    ).toBeInTheDocument();

    // The picker shows the option's label, not its id.
    expect(screen.getByRole("combobox", { name: "Choose an app" })).toHaveTextContent("Command");
    await user.click(screen.getByRole("combobox", { name: "Choose an app" }));
    await user.click(screen.getByRole("option", { name: "Project .mcp.json" }));
    expect(screen.getByText(/Bearer \$\{WEALTHFOLIO_TOKEN\}/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose an app" })).toHaveTextContent(
      "Project .mcp.json",
    );

    await user.click(screen.getByRole("button", { name: "Codex / ChatGPT" }));
    expect(screen.getByText(/\[mcp_servers\.wealthfolio\]/)).toBeInTheDocument();
    expect(screen.getByText("~/.codex/config.toml")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Other" }));
    await user.click(screen.getByRole("combobox", { name: "Choose an app" }));
    await user.click(screen.getByRole("option", { name: "OpenCode" }));
    expect(screen.getByText(/"type": "remote"/)).toBeInTheDocument();
    expect(screen.getByText("opencode.json")).toBeInTheDocument();
  });
});
