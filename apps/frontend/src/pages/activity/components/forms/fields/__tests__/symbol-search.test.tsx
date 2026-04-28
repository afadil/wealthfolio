import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SymbolSearch } from "../symbol-search";

const resolveSymbolQuoteMock = vi.fn();

vi.mock("@/adapters", () => ({
  resolveSymbolQuote: (...args: unknown[]) => resolveSymbolQuoteMock(...args),
}));

vi.mock("@/components/ticker-search", () => ({
  __esModule: true,
  default: ({
    onSelectResult,
  }: {
    onSelectResult: (symbol: string, result?: Record<string, unknown>) => void;
  }) => (
    <>
      <button
        type="button"
        data-testid="select-symbol"
        onClick={() =>
          onSelectResult("VWRPL.XC", {
            symbol: "VWRPL.XC",
            longName: "Vanguard FTSE All-World UCITS ETF",
            shortName: "VWRP",
            exchange: "CXE",
            exchangeMic: "CXE",
            quoteType: "EQUITY",
            currency: "GBp",
            // Intentionally omitted to reproduce the regression path.
            currencySource: undefined,
            dataSource: "YAHOO",
          })
        }
      >
        Select Symbol
      </button>
      <button
        type="button"
        data-testid="select-existing-crypto"
        onClick={() =>
          onSelectResult("BTC", {
            symbol: "BTC",
            longName: "Bitcoin EUR",
            shortName: "Bitcoin EUR",
            exchange: "",
            quoteType: "CRYPTOCURRENCY",
            currency: "EUR",
            dataSource: "YAHOO",
            isExisting: true,
            existingAssetId: "asset-btc-eur",
          })
        }
      >
        Select Existing Crypto
      </button>
    </>
  ),
}));

interface FormValues {
  assetId: string;
  exchangeMic?: string;
  currency?: string;
  symbolQuoteCcy?: string;
  symbolInstrumentType?: string;
  assetMetadata?: { name?: string; kind?: string };
}

function TestForm() {
  const methods = useForm<FormValues>({
    defaultValues: {
      assetId: "",
      currency: "GBP",
      symbolQuoteCcy: undefined,
    },
  });

  return (
    <FormProvider {...methods}>
      <form>
        <SymbolSearch<FormValues>
          name="assetId"
          exchangeMicName="exchangeMic"
          currencyName="currency"
          quoteCcyName="symbolQuoteCcy"
          instrumentTypeName="symbolInstrumentType"
          assetMetadataName="assetMetadata"
        />
        <input type="hidden" {...methods.register("symbolQuoteCcy")} />
        <input type="hidden" {...methods.register("assetMetadata.name")} />
        <div data-testid="asset-id">{methods.watch("assetId") ?? ""}</div>
        <div data-testid="exchange-mic">{methods.watch("exchangeMic") ?? ""}</div>
        <div data-testid="quote-ccy">{methods.watch("symbolQuoteCcy") ?? ""}</div>
        <div data-testid="asset-name">{methods.watch("assetMetadata.name") ?? ""}</div>
      </form>
    </FormProvider>
  );
}

describe("SymbolSearch", () => {
  beforeEach(() => {
    resolveSymbolQuoteMock.mockReset();
  });

  it("persists provider-resolved quote currency hint even without currencySource", async () => {
    resolveSymbolQuoteMock.mockResolvedValue({
      currency: "GBP",
      price: 131.6,
    });

    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByTestId("select-symbol"));

    await waitFor(() => {
      expect(screen.getByTestId("quote-ccy")).toHaveTextContent("GBP");
    });

    expect(screen.getByTestId("asset-id")).toHaveTextContent("VWRPL");
    expect(screen.getByTestId("exchange-mic")).toHaveTextContent("CXE");
    expect(screen.getByTestId("asset-name")).toHaveTextContent("Vanguard FTSE All-World UCITS ETF");
    expect(resolveSymbolQuoteMock).toHaveBeenCalledWith(
      "VWRPL.XC",
      "CXE",
      "EQUITY",
      undefined,
      "GBp",
    );
  });

  it("does not overwrite an existing asset quote currency with resolver output", async () => {
    resolveSymbolQuoteMock.mockResolvedValue({
      currency: "CAD",
      price: 103121.59,
    });

    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByTestId("select-existing-crypto"));

    await waitFor(() => {
      expect(resolveSymbolQuoteMock).toHaveBeenCalledWith(
        "BTC",
        undefined,
        "CRYPTOCURRENCY",
        undefined,
        "EUR",
      );
    });

    expect(screen.getByTestId("asset-id")).toHaveTextContent("BTC");
    expect(screen.getByTestId("quote-ccy")).toHaveTextContent("EUR");
  });
});
