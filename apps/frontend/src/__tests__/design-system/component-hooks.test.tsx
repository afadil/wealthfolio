import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@wealthfolio/ui";

it("retains Slot composition, refs, variants and caller attributes with additive hooks", () => {
  const ref = createRef<HTMLButtonElement>();
  const onClick = vi.fn();
  render(
    <Button
      asChild
      ref={ref}
      variant="outline"
      size="sm"
      onClick={onClick}
      data-slot="custom-action"
    >
      <button>Inspect</button>
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Inspect" });
  expect(ref.current).toBe(button);
  expect(button).toHaveAttribute("data-slot", "custom-action");
  expect(button).toHaveAttribute("data-variant", "outline");
  expect(button).toHaveAttribute("data-size", "sm");
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
});
it("keeps financial badges and table/card DOM ref targets", () => {
  const tableRef = createRef<HTMLTableElement>();
  const cardRef = createRef<HTMLDivElement>();
  render(
    <Card ref={cardRef}>
      <CardContent>
        <Badge variant="success">Gain</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="info">Info</Badge>
        <Table ref={tableRef}>
          <TableBody>
            <TableRow>
              <TableCell>Example</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>,
  );
  expect(cardRef.current).toHaveAttribute("data-slot", "card");
  expect(tableRef.current).toBe(screen.getByRole("table"));
  expect(screen.getByRole("cell")).toHaveAttribute("data-slot", "table-cell");
  expect(screen.getByText("Gain")).toHaveClass("bg-success");
  expect(screen.getByText("Warning")).toHaveClass("bg-warning");
  expect(screen.getByText("Info")).toHaveClass("bg-info");
});
