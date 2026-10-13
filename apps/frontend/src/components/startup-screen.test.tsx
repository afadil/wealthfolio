import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StartupScreen } from "./startup-screen";

it("uses the same empty avatar frame as the HTML splash while opening a profile", () => {
  const { container } = render(
    <StartupScreen profile={{ name: "Personal", avatarId: "line-wave-animated" }} />,
  );
  expect(container.querySelector("main")).toHaveClass("profile-boot-screen", "profile-lock-screen");
  expect(container.querySelector(".profile-opening-placeholder")).toHaveClass(
    "profile-lock-avatar",
  );
  expect(container.querySelector("svg, img, image")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Opening");
});
it("keeps recovery errors visible and stops the loading animation", () => {
  const { container } = render(
    <StartupScreen
      profile={{ name: "Personal", avatarId: "default" }}
      error="Database unavailable"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
  expect(screen.getByRole("status")).not.toHaveClass("profile-loading-status");
  expect(container.querySelector(".profile-loading-avatar")).toBeNull();
});
