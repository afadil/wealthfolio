import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntervalSelector } from "@wealthfolio/ui";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it.each([undefined, "interval-test"])(
  "preserves uncontrolled selection with storage key %s",
  (storageKey) => {
    const onSelect = vi.fn();
    render(
      <IntervalSelector defaultValue="3M" storageKey={storageKey} onIntervalSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    expect(onSelect).toHaveBeenCalledWith("1Y", "past year", expect.any(Object));
    if (storageKey) expect(localStorage.getItem(storageKey)).toBe(JSON.stringify("1Y"));
  },
);

it("uses the parent's controlled selection without writing another preference", () => {
  localStorage.setItem("interval-test", JSON.stringify("ALL"));
  const onSelect = vi.fn();
  const { rerender } = render(
    <IntervalSelector value="1Y" storageKey="interval-test" onIntervalSelect={onSelect} />,
  );
  expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "1M" }));
  expect(onSelect).toHaveBeenCalledWith("1M", "past month", expect.any(Object));
  expect(localStorage.getItem("interval-test")).toBe(JSON.stringify("ALL"));
  expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
  rerender(<IntervalSelector value="1M" storageKey="interval-test" onIntervalSelect={onSelect} />);
  expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
});
