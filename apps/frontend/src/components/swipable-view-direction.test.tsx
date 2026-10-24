import { render, waitFor } from "@testing-library/react";
import { DirectionProvider, SwipableView } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";

// jsdom has no layout, so the slide positions Embla computes cannot be checked
// here; what matters is that Embla is told the page direction. Without it, a
// right-to-left page scrolls the second and third views offscreen.

// jsdom has neither observer; SwipableView watches slide size and visibility.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

const items = [
  { name: "One", content: <p>One</p> },
  { name: "Two", content: <p>Two</p> },
];

describe("SwipableView", () => {
  it.each(["ltr", "rtl"] as const)("gives Embla the %s direction", async (direction) => {
    const onInit = vi.fn();
    render(
      <DirectionProvider direction={direction}>
        <SwipableView items={items} onInit={onInit} />
      </DirectionProvider>,
    );
    await waitFor(() => expect(onInit).toHaveBeenCalled());
    const api = onInit.mock.calls.at(-1)?.[0];
    expect(api.internalEngine().options.direction).toBe(direction);
  });
});
