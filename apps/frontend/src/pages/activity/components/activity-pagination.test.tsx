import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityPagination } from "./activity-pagination";

describe("ActivityPagination", () => {
  it("announces the loaded count through a status live region", () => {
    render(<ActivityPagination isFetching={false} totalFetched={100} totalCount={130} />);

    expect(screen.getByRole("status")).toHaveTextContent("100/130 activities");
  });
});
