import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetLogoRegistrySync } from "@/components/asset-logo-registry-sync";
import { assetLogoRegistry } from "@/lib/asset-logo-registry";
import { QueryKeys } from "@/lib/query-keys";
import type { AssetLogo, AssetLogoSummary } from "@/lib/types";
import { render } from "@/test/render";
import { useAssetLogoMutations } from "./use-asset-logos";

const { adapters, toastMock } = vi.hoisted(() => ({
  adapters: {
    listAssetLogos: vi.fn(),
    getAssetLogo: vi.fn(),
    upsertAssetLogo: vi.fn(),
    deleteAssetLogo: vi.fn(),
    logger: { error: vi.fn() },
  },
  toastMock: vi.fn(),
}));

vi.mock("@/adapters", () => adapters);
vi.mock("@wealthfolio/ui/components/ui/use-toast", () => ({ toast: toastMock }));

const INDEX_KEY = [QueryKeys.ASSET_LOGO_INDEX];

const savedLogo: AssetLogo = {
  assetId: "a1",
  mimeType: "image/png",
  dataBase64: "AAAA",
  sha256: "sha-new",
  width: 256,
  height: 256,
  createdAt: "2026-09-02T00:00:00Z",
  updatedAt: "2026-09-02T00:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useAssetLogoMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetLogoRegistry.reset();
    adapters.listAssetLogos.mockResolvedValue([]);
  });

  it("primes the registry, updates the index and toasts on save", async () => {
    adapters.upsertAssetLogo.mockResolvedValue(savedLogo);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<AssetLogoSummary[]>(INDEX_KEY, [
      {
        assetId: "other",
        displayCode: "MSFT",
        sha256: "sha-other",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { result } = renderHook(() => useAssetLogoMutations(), { wrapper });

    await act(async () => {
      await result.current.setLogo.mutateAsync({
        assetId: "a1",
        dataBase64: "AAAA",
        displayCode: "AAPL",
      });
    });

    expect(adapters.upsertAssetLogo).toHaveBeenCalledWith("a1", { dataBase64: "AAAA" });
    expect(assetLogoRegistry.getDataUri("sha-new")).toBe("data:image/png;base64,AAAA");
    const index = queryClient.getQueryData<AssetLogoSummary[]>(INDEX_KEY);
    expect(index).toHaveLength(2);
    expect(index).toContainEqual({
      assetId: "a1",
      displayCode: "AAPL",
      sha256: "sha-new",
      updatedAt: savedLogo.updatedAt,
    });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("drops the index entry and toasts on reset", async () => {
    adapters.deleteAssetLogo.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<AssetLogoSummary[]>(INDEX_KEY, [
      {
        assetId: "a1",
        displayCode: "AAPL",
        sha256: "sha-a1",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { result } = renderHook(() => useAssetLogoMutations(), { wrapper });

    await act(async () => {
      await result.current.resetLogo.mutateAsync("a1");
    });

    expect(adapters.deleteAssetLogo).toHaveBeenCalledWith("a1");
    expect(queryClient.getQueryData<AssetLogoSummary[]>(INDEX_KEY)).toEqual([]);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("logs and shows a destructive toast when the backend rejects the upload", async () => {
    adapters.upsertAssetLogo.mockRejectedValue(new Error("image exceeds 150 KB"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAssetLogoMutations(), { wrapper });

    await act(async () => {
      await result.current.setLogo.mutateAsync({ assetId: "a1", dataBase64: "AAAA" }).catch(() => {
        // expected
      });
    });

    expect(adapters.logger.error).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "image exceeds 150 KB" }),
    );
  });
});

describe("AssetLogoRegistrySync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetLogoRegistry.reset();
  });

  it("feeds the fetched index into the registry and resets on unmount", async () => {
    adapters.listAssetLogos.mockResolvedValue([
      {
        assetId: "a1",
        displayCode: "AAPL",
        sha256: "sha-a1",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ] satisfies AssetLogoSummary[]);
    const { wrapper } = createWrapper();

    const view = render(<AssetLogoRegistrySync />, { wrapper });

    await waitFor(() => expect(assetLogoRegistry.resolve({ assetId: "a1" })).toBeDefined());

    view.unmount();
    expect(assetLogoRegistry.resolve({ assetId: "a1" })).toBeUndefined();
  });
});
