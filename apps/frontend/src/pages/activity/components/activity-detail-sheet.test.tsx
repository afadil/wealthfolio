import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityReviewReasons } from "./activity-detail-sheet";

describe("ActivityReviewReasons", () => {
  it("shows provider-supplied reasons for an activity needing review", () => {
    render(
      <ActivityReviewReasons
        activity={{
          needsReview: true,
          metadata: {
            mapping_reasons: ["Provider could not supply a market value"],
          },
        }}
      />,
    );

    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Provider could not supply a market value")).toBeInTheDocument();
  });

  it("does not show stale provider reasons after review is complete", () => {
    render(
      <ActivityReviewReasons
        activity={{
          needsReview: false,
          metadata: { mapping_reasons: ["Previously required review"] },
        }}
      />,
    );

    expect(screen.queryByText("Previously required review")).not.toBeInTheDocument();
  });
});
