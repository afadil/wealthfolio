import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportCsvMappingOutput } from "../types";
import { useChatImportSession } from "./use-chat-import-session";

const adapterMocks = vi.hoisted(() => ({
  checkActivitiesImport: vi.fn(),
  createAsset: vi.fn(),
  importActivities: vi.fn(),
  parseCsv: vi.fn(),
  previewImportAssets: vi.fn(),
  saveAccountImportMapping: vi.fn(),
  updateToolResult: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/adapters", () => adapterMocks);

const mapping = {
  csvContent: "Date,Symbol,Quantity,Price,Type\n2024-01-15,NEWCO,2,10,Buy",
  appliedMapping: {
    name: "AI Import",
    accountId: "acct-1",
    importType: "CSV_ACTIVITY",
    fieldMappings: {
      date: "Date",
      symbol: "Symbol",
      quantity: "Quantity",
      unitPrice: "Price",
      activityType: "Type",
    },
    activityMappings: {
      BUY: ["Buy"],
    },
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  },
  parseConfig: {
    defaultCurrency: "USD",
    dateFormat: "auto",
    decimalSeparator: ".",
    thousandsSeparator: ",",
  },
  accountId: "acct-1",
  detectedHeaders: ["Date", "Symbol", "Quantity", "Price", "Type"],
  sampleRows: [["2024-01-15", "NEWCO", "2", "10", "Buy"]],
  totalRows: 1,
  mappingConfidence: "HIGH",
  availableAccounts: [{ id: "acct-1", name: "Brokerage", currency: "USD" }],
} as ImportCsvMappingOutput;

describe("useChatImportSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterMocks.parseCsv.mockResolvedValue({
      headers: ["Date", "Symbol", "Quantity", "Price", "Type"],
      rows: [["2024-01-15", "NEWCO", "2", "10", "Buy"]],
      detectedConfig: {
        defaultCurrency: "USD",
        dateFormat: "auto",
        decimalSeparator: ".",
        thousandsSeparator: ",",
      },
      errors: [],
      rowCount: 1,
    });
    adapterMocks.checkActivitiesImport.mockResolvedValue([]);
    adapterMocks.previewImportAssets.mockImplementation(
      ({ candidates }: { candidates: { key: string }[] }) => [
        {
          key: candidates[0].key,
          status: "AUTO_RESOLVED_NEW_ASSET",
          resolutionSource: "AUTO",
          draft: {
            kind: "INVESTMENT",
            name: "NewCo",
            displayCode: "NEWCO",
            isActive: true,
            quoteMode: "MARKET",
            quoteCcy: "USD",
            instrumentType: "EQUITY",
            instrumentSymbol: "NEWCO",
          },
        },
      ],
    );
    adapterMocks.createAsset.mockResolvedValue({ id: "asset-newco" });
    adapterMocks.importActivities.mockResolvedValue({
      importRunId: "run-1",
      summary: { success: true, imported: 1 },
      activities: [],
    });
    adapterMocks.saveAccountImportMapping.mockResolvedValue(undefined);
    adapterMocks.updateToolResult.mockResolvedValue(undefined);
  });

  it("creates auto-resolved pending assets before importing chat CSV drafts", async () => {
    const { result } = renderHook(() => useChatImportSession({ mapping }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.confirm();
    });

    expect(adapterMocks.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentSymbol: "NEWCO",
        quoteCcy: "USD",
        instrumentType: "EQUITY",
      }),
    );
    expect(adapterMocks.importActivities).toHaveBeenCalledWith({
      activities: [
        expect.objectContaining({
          assetId: "asset-newco",
          symbol: "NEWCO",
        }),
      ],
    });
  });
});
