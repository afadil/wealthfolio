import { runInNewContext } from "node:vm";
import html from "../../../index.html?raw";
import { afterEach, expect, it, vi } from "vitest";

const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

afterEach(() => {
  sessionStorage.clear();
  document.documentElement.classList.remove("profile-opening");
  vi.restoreAllMocks();
});

it("uses the generic splash only for a recent profile-opening hint", () => {
  sessionStorage.setItem("wealthfolio-profile-opening", JSON.stringify({ at: Date.now() }));
  runInNewContext(bootstrap, { document, sessionStorage });
  expect(document.documentElement).toHaveClass("profile-opening");
});

it.each([
  null,
  "invalid json",
  JSON.stringify({ at: 0 }),
  JSON.stringify({ at: Date.now() + 60000 }),
])("keeps the normal splash for an absent, malformed, expired, or future hint: %s", (hint) => {
  if (hint !== null) sessionStorage.setItem("wealthfolio-profile-opening", hint);
  runInNewContext(bootstrap, { document, sessionStorage });
  expect(document.documentElement).not.toHaveClass("profile-opening");
});

it("can still boot when presentation storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  expect(() => runInNewContext(bootstrap, { document, sessionStorage })).not.toThrow();
  expect(document.documentElement).not.toHaveClass("profile-opening");
});
