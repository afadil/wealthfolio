import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConnectEmptyState } from "./connect-empty-state";

vi.mock("@/features/wealthfolio-connect/hooks/use-connect-url", () => ({
  useConnectUrl: (placement: string) => `https://connect.example/?placement=${placement}`,
}));
vi.mock("@/adapters", () => ({ openUrlInBrowser: vi.fn() }));
vi.mock("./connect-features", () => ({ ConnectFeatures: () => null }));
vi.mock("./connect-flow-diagram", () => ({ ConnectFlowDiagram: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function getStartedHref(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ConnectEmptyState />
    </MemoryRouter>,
  );
  return screen.getByRole("link", { name: /connect:emptyState.getStarted/ }).getAttribute("href");
}

describe("ConnectEmptyState", () => {
  it("credits the in-app link that opened the page", () => {
    expect(getStartedHref("/connect?placement=import_result")).toBe(
      "https://connect.example/?placement=import_result",
    );
  });

  it.each(["/connect", "/connect?placement=subscription_plans", "/connect?placement=evil"])(
    "falls back to the Connect page placement for %s",
    (entry) => {
      expect(getStartedHref(entry)).toBe("https://connect.example/?placement=connect_empty_state");
    },
  );
});
