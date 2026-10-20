import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "./help-tooltip";

describe("HelpTooltip", () => {
  it("names its icon-only trigger, since tooltips are not announced", () => {
    render(<HelpTooltip content="Columns are matched by name." />);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
  });
});
