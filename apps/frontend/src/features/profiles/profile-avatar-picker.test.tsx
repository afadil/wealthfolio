import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROFILE_AVATAR_GROUPS } from "./avatar-catalog";
import { ProfileAvatarPicker } from "./profile-avatar-picker";

describe("ProfileAvatarPicker", () => {
  it("shows all avatars and only changes the avatar on selection", () => {
    const onChange = vi.fn();
    render(<ProfileAvatarPicker value="line-curls-animated" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: `3D avatar ${PROFILE_AVATAR_GROUPS.find((group) => group.name === "3D")!.avatars.indexOf("clay-artist-animated") + 1}`,
      }),
    );
    expect(onChange).toHaveBeenCalledWith("clay-artist-animated");
  });

  it.each([
    ["Line", "line-curls-animated"],
    ["3D", "clay-artist-animated"],
    ["Sketch", "sketch-storyteller-animated"],
    ["Pixel art", "pixel-wizard-animated"],
    ["Abstract", "abstract-architect-animated"],
  ])("shows eight selectable avatars in %s", (style, added) => {
    const onChange = vi.fn();
    render(<ProfileAvatarPicker value="line-curls-animated" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: style }));
    const avatars = within(screen.getByRole("group", { name: `${style} avatars` }));
    expect(avatars.getAllByRole("button")).toHaveLength(8);
    fireEvent.click(
      avatars.getByRole("button", {
        name: `${style} avatar ${PROFILE_AVATAR_GROUPS.find((group) => group.name === style)!.avatars.indexOf(added) + 1}`,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(added);
  });
});
