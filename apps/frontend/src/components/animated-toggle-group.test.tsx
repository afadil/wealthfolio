import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnimatedToggleGroup } from "@wealthfolio/ui/components/ui/animated-toggle-group";

describe("AnimatedToggleGroup", () => {
  it("names an option by its aria-label when the visible label needs context", () => {
    const onValueChange = vi.fn();
    render(
      <AnimatedToggleGroup
        aria-label="Billing period"
        value="monthly"
        onValueChange={onValueChange}
        items={[
          { value: "monthly", label: "Monthly", "aria-label": "Monthly billing" },
          { value: "yearly", label: "Yearly", "aria-label": "Yearly billing" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Billing period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monthly billing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Yearly billing" }));
    expect(onValueChange).toHaveBeenCalledWith("yearly");
  });

  it("marks its thumb for theme tokens", () => {
    const { container } = render(
      <AnimatedToggleGroup value="a" items={[{ value: "a", label: "A" }]} />,
    );
    expect(container.querySelector('[data-slot="segmented-thumb"]')).not.toBeNull();
  });
});
