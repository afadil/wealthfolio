// Deprecated @wealthfolio/ui APIs kept for addons built against earlier SDKs (Radix era).
// The app itself does not use them; they are removed at the next major SDK version.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyPlaceholder,
  ToggleGroup,
  ToggleGroupItem,
} from "@wealthfolio/ui";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

describe("deprecated EmptyPlaceholder", () => {
  it("renders the props form", () => {
    render(<EmptyPlaceholder title="No fees" description="Nothing in this period." />);
    expect(screen.getByText("No fees")).toBeInTheDocument();
    expect(screen.getByText("Nothing in this period.")).toBeInTheDocument();
  });

  it("renders the compound form with a named icon", () => {
    const { container } = render(
      <EmptyPlaceholder>
        <EmptyPlaceholder.Icon name="Goals" />
        <EmptyPlaceholder.Title>No goals</EmptyPlaceholder.Title>
        <EmptyPlaceholder.Description>Create one.</EmptyPlaceholder.Description>
      </EmptyPlaceholder>,
    );
    expect(screen.getByText("No goals")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-icon"] svg')).not.toBeNull();
  });
});

function Menu({ onSelect }: { onSelect: (event: Event) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelect}>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("deprecated DropdownMenuItem onSelect", () => {
  it("is called when the item is chosen, and the menu closes", async () => {
    const onSelect = vi.fn();
    render(<Menu onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the menu open when the handler calls preventDefault, as Radix did", async () => {
    render(<Menu onSelect={(event) => event.preventDefault()} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

function SingleGroup({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("all");
  return (
    <ToggleGroup
      type="single"
      // An addon built against Radix passes and receives a string.
      value={value as unknown as string[]}
      onValueChange={
        ((next: string) => {
          onChange(next);
          if (next) setValue(next);
        }) as unknown as (value: string[]) => void
      }
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="linked">Linked</ToggleGroupItem>
    </ToggleGroup>
  );
}

describe("deprecated ToggleGroup type", () => {
  it('takes and returns a string with type="single"', async () => {
    const onChange = vi.fn();
    render(<SingleGroup onChange={onChange} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Linked" }));
    expect(onChange).toHaveBeenLastCalledWith("linked");
    expect(screen.getByRole("button", { name: "Linked" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    // Pressing the active item again clears it; Radix reported "".
    await userEvent.click(screen.getByRole("button", { name: "Linked" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it('allows several pressed items with type="multiple"', async () => {
    render(
      <ToggleGroup type="multiple" defaultValue={["a"]}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>,
    );
    await userEvent.click(screen.getByRole("button", { name: "B" }));
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
  });
});
