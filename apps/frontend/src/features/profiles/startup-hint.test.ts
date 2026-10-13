import { beforeEach, expect, it } from "vitest";
import { clearOpeningProfile, openingProfileHint, rememberOpeningProfile } from "./startup-hint";
beforeEach(() => sessionStorage.clear());
it("persists only public display metadata", () => {
  rememberOpeningProfile({
    id: "a",
    name: "Personal",
    avatarId: "clay-pebble-animated",
    lockEnabled: true,
  });
  expect(openingProfileHint()).toEqual({
    id: "a",
    name: "Personal",
    avatarId: "clay-pebble-animated",
  });
  expect(sessionStorage.getItem("wealthfolio-profile-opening")).not.toContain("lockEnabled");
  clearOpeningProfile();
  expect(openingProfileHint()).toBeUndefined();
});
it.each([
  "broken",
  JSON.stringify({ id: "a", name: "A", avatarId: "clay-pebble-animated", at: Date.now() - 301000 }),
  JSON.stringify({ id: "a", name: "A", avatarId: "../../private", at: Date.now() }),
])("ignores invalid hints: %s", (value) => {
  sessionStorage.setItem("wealthfolio-profile-opening", value);
  expect(openingProfileHint()).toBeUndefined();
});
