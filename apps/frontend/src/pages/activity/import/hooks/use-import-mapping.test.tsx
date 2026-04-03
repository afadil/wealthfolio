import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ActivityType, ImportType } from "@/lib/types";
import { useImportMapping } from "./use-import-mapping";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useImportMapping activity type mappings", () => {
  it("starts with exact identity mappings for canonical activity types", () => {
    const { result } = renderHook(() => useImportMapping(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mapping.activityMappings[ActivityType.BUY]).toEqual(["BUY"]);
    expect(result.current.mapping.activityMappings[ActivityType.WITHDRAWAL]).toEqual([
      "WITHDRAWAL",
    ]);
  });

  it("stores full normalized labels and clears mappings without leaving empty keys", () => {
    const { result } = renderHook(
      () =>
        useImportMapping({
          defaultMapping: {
            accountId: "acc-1",
            importType: ImportType.ACTIVITY,
            name: "",
            fieldMappings: {},
            activityMappings: {},
            symbolMappings: {},
            accountMappings: {},
            symbolMappingMeta: {},
          },
        }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.handleActivityTypeMapping("Dividend Qualified", ActivityType.DIVIDEND);
    });

    expect(result.current.mapping.activityMappings[ActivityType.DIVIDEND]).toEqual([
      "DIVIDEND_QUALIFIED",
    ]);

    act(() => {
      result.current.handleActivityTypeMapping("Dividend Qualified", "");
    });

    expect(result.current.mapping.activityMappings[ActivityType.DIVIDEND]).toBeUndefined();
    expect(result.current.mapping.activityMappings[""]).toBeUndefined();
  });

  it("remaps one csv label without colliding with a different longer label", () => {
    const { result } = renderHook(
      () =>
        useImportMapping({
          defaultMapping: {
            accountId: "acc-1",
            importType: ImportType.ACTIVITY,
            name: "",
            fieldMappings: {},
            activityMappings: {},
            symbolMappings: {},
            accountMappings: {},
            symbolMappingMeta: {},
          },
        }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.handleActivityTypeMapping("Transfer Out Fee", ActivityType.FEE);
    });

    act(() => {
      result.current.handleActivityTypeMapping("Transfer Out", ActivityType.TRANSFER_OUT);
    });

    expect(result.current.mapping.activityMappings[ActivityType.FEE]).toEqual(["TRANSFER_OUT_FEE"]);
    expect(result.current.mapping.activityMappings[ActivityType.TRANSFER_OUT]).toEqual([
      "TRANSFER_OUT",
    ]);
  });
});
