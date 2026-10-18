import { render, screen } from "@testing-library/react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@wealthfolio/ui";
import { Bar, BarChart, XAxis } from "recharts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ChartTooltipContent", () => {
  beforeEach(() => {
    // jsdom has no layout; give the responsive container a size so the chart renders.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 400, height: 200 }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not forward Recharts tooltip props to the DOM", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <ChartContainer config={{ income: { label: "Income", color: "#000" } }}>
        <BarChart data={[{ month: "Jan", income: 120 }]}>
          <XAxis dataKey="month" />
          <ChartTooltip
            defaultIndex={0}
            content={<ChartTooltipContent className="tooltip-under-test" />}
          />
          <Bar dataKey="income" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>,
    );

    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(container.querySelector(".tooltip-under-test")).not.toHaveAttribute("cursor");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
