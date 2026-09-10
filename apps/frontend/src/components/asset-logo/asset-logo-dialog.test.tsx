import { fireEvent, render, screen, waitFor } from "@/test/render";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assetLogoRegistry } from "@/lib/asset-logo-registry";
import { LogoImageError, type NormalizedLogoImage } from "@/lib/normalize-logo-image";
import { AssetLogoDialog } from "./asset-logo-dialog";

interface MutateOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

const { normalizeLogoImage, setLogoMutate, resetLogoMutate } = vi.hoisted(() => ({
  normalizeLogoImage: vi.fn<(file: Blob) => Promise<NormalizedLogoImage>>(),
  setLogoMutate:
    vi.fn<(vars: { assetId: string; dataBase64: string }, options?: MutateOptions) => void>(),
  resetLogoMutate: vi.fn<(assetId: string, options?: MutateOptions) => void>(),
}));

// The Dialog renders through a portal; swap it for plain markup so queries work.
vi.mock("@wealthfolio/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wealthfolio/ui")>()),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/lib/normalize-logo-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/normalize-logo-image")>()),
  normalizeLogoImage,
}));

vi.mock("@/hooks/use-asset-logos", () => ({
  useAssetLogoMutations: () => ({
    setLogo: { mutate: setLogoMutate, isPending: false },
    resetLogo: { mutate: resetLogoMutate, isPending: false },
  }),
}));

vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: () => false }));
vi.mock("@/adapters", () => ({ getAssetLogo: vi.fn().mockResolvedValue(null) }));

function normalized(tag: string): NormalizedLogoImage {
  return {
    blob: new Blob(["x"], { type: "image/png" }),
    width: 256,
    height: 256,
    dataBase64: tag,
    dataUri: `data:image/png;base64,${tag}`,
  };
}

function selectFile(name = "logo.png") {
  const input = screen.getByTestId("asset-logo-file-input");
  const file = new File(["png"], name, { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <AssetLogoDialog
      open
      onOpenChange={onOpenChange}
      assetId="asset-1"
      symbol="AAPL"
      name="Apple Inc."
    />,
  );
  return onOpenChange;
}

describe("AssetLogoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetLogoRegistry.reset();
  });

  it("shows the Default badge, no Reset, and a disabled Save until an image is ready", () => {
    renderDialog();

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-logo-reset")).not.toBeInTheDocument();
    expect(screen.getByTestId("asset-logo-save")).toBeDisabled();
    expect(screen.getByText("AAPL · Apple Inc.")).toBeInTheDocument();
    expect(screen.getByTestId("asset-logo-preview")).toHaveAttribute(
      "data-preview-source",
      "current",
    );
  });

  it("previews the normalized image and saves it, closing on success", async () => {
    normalizeLogoImage.mockResolvedValue(normalized("READY"));
    setLogoMutate.mockImplementation((_vars, options) => options?.onSuccess?.());
    const onOpenChange = renderDialog();

    const file = selectFile();
    expect(normalizeLogoImage).toHaveBeenCalledWith(file);

    await waitFor(() =>
      expect(screen.getByTestId("asset-logo-preview")).toHaveAttribute(
        "data-preview-source",
        "new",
      ),
    );
    const save = screen.getByTestId("asset-logo-save");
    expect(save).toBeEnabled();

    fireEvent.click(save);

    expect(setLogoMutate).toHaveBeenCalledWith(
      { assetId: "asset-1", dataBase64: "READY", displayCode: "AAPL" },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the normalization error inline and keeps Save disabled", async () => {
    normalizeLogoImage.mockRejectedValue(new LogoImageError("too_large_input"));
    renderDialog();

    selectFile();

    await waitFor(() => expect(screen.getByTestId("asset-logo-error")).toBeInTheDocument());
    expect(screen.getByTestId("asset-logo-error")).toHaveTextContent(
      "That file is too large. Choose an image under 10 MB.",
    );
    expect(screen.getByTestId("asset-logo-save")).toBeDisabled();
  });

  it("keeps the preview and Save enabled when saving fails (the hook toasts)", async () => {
    normalizeLogoImage.mockResolvedValue(normalized("READY"));
    setLogoMutate.mockImplementation((_vars, options) =>
      options?.onError?.(new Error("image exceeds 150 KB")),
    );
    const onOpenChange = renderDialog();

    selectFile();
    await waitFor(() => expect(screen.getByTestId("asset-logo-save")).toBeEnabled());
    fireEvent.click(screen.getByTestId("asset-logo-save"));

    expect(screen.getByTestId("asset-logo-preview")).toHaveAttribute("data-preview-source", "new");
    expect(screen.getByTestId("asset-logo-save")).toBeEnabled();
    expect(screen.queryByTestId("asset-logo-error")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not adopt another asset's logo that shares the display code", () => {
    assetLogoRegistry.setIndex([
      {
        assetId: "asset-2",
        displayCode: "AAPL",
        sha256: "sha-2",
        updatedAt: "2026-09-02T00:00:00Z",
      },
    ]);
    renderDialog();

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-logo-reset")).not.toBeInTheDocument();
  });

  it("offers Reset for a custom logo and closes after resetting", () => {
    assetLogoRegistry.setIndex([
      {
        assetId: "asset-1",
        displayCode: "AAPL",
        sha256: "sha-1",
        updatedAt: "2026-09-02T00:00:00Z",
      },
    ]);
    resetLogoMutate.mockImplementation((_id, options) => options?.onSuccess?.());
    const onOpenChange = renderDialog();

    expect(screen.getByText("Custom")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("asset-logo-reset"));

    expect(resetLogoMutate).toHaveBeenCalledWith("asset-1", expect.anything());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
