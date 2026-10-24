/**
 * Day-grouped lists (Activities, Spending). Each list buckets its own rows
 * into days and adds its own facts about a day; the group's shape and the
 * flat rendering a virtualizer works from are shared here.
 */
export interface DayGroup<T> {
  /** The day's key; also the React key of its header. */
  key: string;
  items: T[];
}

/** The row type a day group holds. */
type DayItem<G> = G extends DayGroup<infer T> ? T : never;

/** One entry in the flat, virtualized rendering of a day-grouped list. */
export type DayListItem<G, T> =
  | {
      kind: "header";
      key: string;
      group: G;
      /**
       * True for the trailing day only. While more pages are pending it may
       * still be missing rows, so its header leaves out what it sums.
       */
      isLastGroup: boolean;
    }
  | { kind: "row"; key: string; item: T };

/** Each header immediately before its own rows: the single index space a virtualizer needs. */
export function flattenDayGroups<G extends DayGroup<unknown>>(
  groups: G[],
  getKey: (item: DayItem<G>) => string,
): DayListItem<G, DayItem<G>>[] {
  const out: DayListItem<G, DayItem<G>>[] = [];
  // A key stays put when a page loads below it, so a header keeps its measured
  // height; the counter only keeps keys unique should a day ever recur.
  const seen = new Map<string, number>();
  groups.forEach((group, index) => {
    const repeat = seen.get(group.key) ?? 0;
    seen.set(group.key, repeat + 1);
    out.push({
      kind: "header",
      key: repeat ? `day:${group.key}:${repeat}` : `day:${group.key}`,
      group,
      isLastGroup: index === groups.length - 1,
    });
    for (const item of group.items as DayItem<G>[]) {
      out.push({ kind: "row", key: getKey(item), item });
    }
  });
  return out;
}
