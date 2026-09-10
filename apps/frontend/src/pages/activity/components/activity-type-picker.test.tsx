import { ActivityType } from "@/lib/constants";
import { render, screen } from "@/test/render";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityTypePicker } from "./activity-type-picker";

vi.mock("@wealthfolio/ui/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselNext: () => null,
  CarouselPrevious: () => null,
}));

describe("ActivityTypePicker reclassification types", () => {
  it("keeps ADJUSTMENT out of the ordinary creation picker", () => {
    render(<ActivityTypePicker onSelect={vi.fn()} />);

    expect(screen.queryByTestId("activity-type-adjustment")).not.toBeInTheDocument();
  });

  it("offers every editable canonical target while reclassifying", () => {
    render(<ActivityTypePicker onSelect={vi.fn()} includeReclassificationTypes />);

    expect(screen.getByTestId(`activity-type-${ActivityType.CREDIT.toLowerCase()}`)).toBeVisible();
    expect(
      screen.getByTestId(`activity-type-${ActivityType.ADJUSTMENT.toLowerCase()}`),
    ).toBeVisible();
  });
});
