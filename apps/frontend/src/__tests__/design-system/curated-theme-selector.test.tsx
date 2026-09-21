import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CuratedThemeSelector } from "@/components/curated-theme-selector";
import { themes } from "@/themes/generated/registry";

function InteractiveSelector() {
  const [value, setValue] = useState("flexoki");
  return <CuratedThemeSelector value={value} onChange={setValue} />;
}

describe("curated theme selection", () => {
  it("discovers every theme and renders both previews directly from its tokens", () => {
    const { container } = render(<CuratedThemeSelector value="flexoki" onChange={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(themes.length);
    for (const theme of themes) {
      const radio = screen.getByRole("radio", { name: theme.name });
      const card = radio.closest("label")!;
      expect(within(card).getAllByText("Aa")).toHaveLength(2);
      const previews = card.querySelectorAll<HTMLElement>('div[aria-hidden="true"]');
      const expected = document.createElement("div");
      expected.style.background = theme.light.background;
      expect(previews[0].style.background).toBe(expected.style.background);
      expected.style.background = theme.dark.background;
      expect(previews[1].style.background).toBe(expected.style.background);
    }
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it.each([undefined, "theme-from-a-newer-version"])(
    "renders Flexoki for %s without writing a replacement preference",
    (value) => {
      const onChange = vi.fn();
      render(<CuratedThemeSelector value={value} onChange={onChange} />);
      expect(screen.getByRole("radio", { name: "Flexoki" })).toBeChecked();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("allows an explicit Flexoki selection to replace an unknown saved ID", async () => {
    const onChange = vi.fn();
    render(<CuratedThemeSelector value="future-theme" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Flexoki" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("flexoki");
  });

  it("supports native arrow selection and controlled preference changes", async () => {
    const user = userEvent.setup();
    render(<InteractiveSelector />);
    await user.tab();
    expect(screen.getByRole("radio", { name: "Flexoki" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: themes[1].name })).toBeChecked();
    expect(screen.getByRole("radio", { name: themes[1].name })).toHaveFocus();
    await user.click(screen.getByRole("radio", { name: "Flexoki" }));
    expect(screen.getByRole("radio", { name: "Flexoki" })).toBeChecked();
  });
});
