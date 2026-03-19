import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TickerAvatar } from "./ticker-avatar";

const { mockAvatarImage } = vi.hoisted(() => ({
  mockAvatarImage: vi.fn(
    ({ src, alt, className }: { src?: string; alt?: string; className?: string }) => (
      <img src={src} alt={alt} className={className} />
    ),
  ),
}));

vi.mock("@wealthfolio/ui", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarImage: mockAvatarImage,
}));

describe("TickerAvatar", () => {
  it("uses an exchange-qualified primary logo and disables ambiguous base fallback for non-US MICs", () => {
    const { container } = render(<TickerAvatar symbol="DTE" exchangeMic="XETR" />);
    const images = container.querySelectorAll("img");

    expect(images[0]?.getAttribute("src")).toBe("/ticker-logos/DTE.DE.png");
    expect(images[1]?.getAttribute("src")).toBeNull();
  });

  it("keeps base-symbol fallback for unsuffixed US listings", () => {
    const { container } = render(<TickerAvatar symbol="DTE" exchangeMic="XNYS" />);
    const images = container.querySelectorAll("img");

    expect(images[0]?.getAttribute("src")).toBe("/ticker-logos/DTE.png");
    expect(images[1]?.getAttribute("src")).toBe("/ticker-logos/DTE.png");
  });

  it("preserves already-suffixed symbols", () => {
    const { container } = render(<TickerAvatar symbol="DTE.DE" exchangeMic="XETR" />);
    const images = container.querySelectorAll("img");

    expect(images[0]?.getAttribute("src")).toBe("/ticker-logos/DTE.DE.png");
    expect(images[1]?.getAttribute("src")).toBeNull();
  });
});
