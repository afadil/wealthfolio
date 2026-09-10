import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxTickerAvatar } from "./sandbox-ticker-avatar";

describe("SandboxTickerAvatar", () => {
  afterEach(() => {
    globalThis.__wealthfolioRequestTickerLogo = undefined;
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("requests the exact market logo and revokes its object URL", async () => {
    const logo = new Blob(["png"], { type: "image/png" });
    const requestLogo = vi.fn().mockResolvedValue(logo);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:ticker-logo"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(() => undefined),
    });
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    globalThis.__wealthfolioRequestTickerLogo = requestLogo;

    const view = render(
      <SandboxTickerAvatar symbol="SHOP" exchangeMic="XTSE" instrumentType="EQUITY" />,
    );
    await waitFor(() => expect(requestLogo).toHaveBeenCalledOnce());
    expect(requestLogo).toHaveBeenCalledWith("SHOP", "XTSE", "EQUITY");
    expect(createObjectURL).toHaveBeenCalledWith(logo);

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ticker-logo");
  });

  it.each([
    ["$CASH", "$"],
    ["CASH:CAD", "C$"],
  ])("renders %s without requesting a logo", (symbol, label) => {
    const requestLogo = vi.fn();
    globalThis.__wealthfolioRequestTickerLogo = requestLogo;
    const view = render(<SandboxTickerAvatar symbol={symbol} />);
    expect(view.getByTitle(symbol)).toHaveTextContent(label);
    expect(view.container.querySelector("img")).toBeNull();
    expect(requestLogo).not.toHaveBeenCalled();
  });

  it("releases an equity logo on switching to cash and resumes requests for equities", async () => {
    const logo = new Blob(["png"], { type: "image/png" });
    const requestLogo = vi.fn().mockResolvedValue(logo);
    const createObjectURL = vi.fn(() => "blob:ticker-logo");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    globalThis.__wealthfolioRequestTickerLogo = requestLogo;

    const view = render(<SandboxTickerAvatar symbol="AAPL" />);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(logo));
    view.rerender(<SandboxTickerAvatar symbol="$CASH" />);
    expect(view.getByTitle("$CASH")).toHaveTextContent("$");
    expect(view.container.querySelector("img")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ticker-logo");
    expect(requestLogo).toHaveBeenCalledTimes(1);

    view.rerender(<SandboxTickerAvatar symbol="CASH.TO" />);
    await waitFor(() => expect(requestLogo).toHaveBeenCalledTimes(2));
    expect(requestLogo).toHaveBeenLastCalledWith("CASH.TO", undefined, undefined);
  });

  it("ignores an in-flight equity response after switching to cash", async () => {
    let resolveLogo!: (logo: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      resolveLogo = resolve;
    });
    globalThis.__wealthfolioRequestTickerLogo = vi.fn().mockReturnValue(pending);
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });

    const view = render(<SandboxTickerAvatar symbol="AAPL" />);
    view.rerender(<SandboxTickerAvatar symbol="CASH:CAD" />);
    await act(async () => {
      resolveLogo(new Blob(["png"], { type: "image/png" }));
      await pending;
    });

    expect(view.getByTitle("CASH:CAD")).toHaveTextContent("C$");
    expect(view.container.querySelector("img")).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("keeps the initials fallback when no logo exists", async () => {
    globalThis.__wealthfolioRequestTickerLogo = vi.fn().mockResolvedValue(null);
    const view = render(<SandboxTickerAvatar symbol="MISS" />);

    await waitFor(() =>
      expect(globalThis.__wealthfolioRequestTickerLogo).toHaveBeenCalledWith(
        "MISS",
        undefined,
        undefined,
      ),
    );
    expect(view.getByText("MISS")).toBeInTheDocument();
    expect(view.container.querySelector("img")).toBeNull();
  });
});
