import { describe, expect, it } from "vitest";

import { flattenDayGroups, type DayGroup } from "./day-groups";

const day = (key: string, ...ids: string[]): DayGroup<{ id: string }> => ({
  key,
  items: ids.map((id) => ({ id })),
});

const flatten = (groups: DayGroup<{ id: string }>[]) => flattenDayGroups(groups, (item) => item.id);

describe("flattenDayGroups", () => {
  it("puts each header immediately before its own rows", () => {
    const items = flatten([day("2026-06-07", "a"), day("2026-06-06", "b", "c")]);

    expect(items.map((item) => (item.kind === "header" ? item.group.key : item.item.id))).toEqual([
      "2026-06-07",
      "a",
      "2026-06-06",
      "b",
      "c",
    ]);
  });

  it("marks only the trailing day as last", () => {
    // Rows fetched so far can stop mid-day, so only that day's header has to
    // describe itself as partial.
    const items = flatten([day("2026-06-07", "a"), day("2026-06-06", "b", "c")]);

    expect(items.filter((item) => item.kind === "header" && item.isLastGroup)).toHaveLength(1);
    expect(items.at(-3)).toMatchObject({ kind: "header", isLastGroup: true });
  });

  it("keys headers apart from rows so an id collision cannot merge them", () => {
    const items = flatten([day("a", "a")]);

    expect(items.map((item) => item.key)).toEqual(["day:a", "a"]);
  });

  it("keeps header keys unique when a day recurs", () => {
    const keys = flatten([
      day("2026-10-14", "a"),
      day("2026-10-09", "b"),
      day("2026-10-14", "c"),
    ]).map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns nothing for no groups", () => {
    expect(flatten([])).toEqual([]);
  });
});
