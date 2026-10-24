import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResponsiveSelect } from "@wealthfolio/ui/components/ui/responsive-select";

const options = [
  { value: "cash", label: "Cash" },
  { value: "bonds", label: "Bonds" },
];

describe("ResponsiveSelect on a phone", () => {
  it("announces its trigger as a combobox that opens a dialog", () => {
    render(
      <ResponsiveSelect
        displayMode="mobile"
        aria-label="Account type"
        sheetTitle="Account type"
        options={options}
        value="cash"
        onValueChange={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Account type" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("draws its trigger as a field, not as an outline button", () => {
    render(
      <ResponsiveSelect
        displayMode="mobile"
        aria-label="Account type"
        sheetTitle="Account type"
        options={options}
        value="cash"
        onValueChange={vi.fn()}
      />,
    );
    const classes = screen.getByRole("combobox", { name: "Account type" }).className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "border-(color:--field-border)",
        "bg-input-bg",
        "dark:bg-input/30",
        "shadow-(--field-glow)",
      ]),
    );
    expect(classes).not.toContain("bg-(--button-outline-bg)");
    expect(classes).not.toContain("shadow-(--button-outline-shadow)");
  });
});
