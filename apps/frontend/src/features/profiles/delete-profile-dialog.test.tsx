import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DeleteProfileDialog } from "./delete-profile-dialog";
vi.mock("@/adapters", () => ({ isWeb: true, backupDatabase: vi.fn() }));
vi.mock("@/pages/settings/exports/backup-export-dialog", () => ({
  BackupExportDialog: () => null,
}));
const profile = { id: "a", name: "Personal", avatarId: "clay-pebble-animated", lockEnabled: false };
it("requires the exact profile name and explains server scope", () => {
  const onDelete = vi.fn();
  render(<DeleteProfileDialog profile={profile} onClose={vi.fn()} onDelete={onDelete} />);
  expect(screen.getByRole("heading", { name: /from this server/ })).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Delete profile" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Type Personal to confirm"), {
    target: { value: "Personal" },
  });
  fireEvent.click(button);
  expect(onDelete).toHaveBeenCalledWith("Personal", "");
});
it("requires fresh proof for a protected profile", () => {
  const onDelete = vi.fn();
  render(
    <DeleteProfileDialog
      profile={{ ...profile, lockEnabled: true }}
      onClose={vi.fn()}
      onDelete={onDelete}
    />,
  );
  fireEvent.change(screen.getByLabelText("Type Personal to confirm"), {
    target: { value: "Personal" },
  });
  const button = screen.getByRole("button", { name: "Delete profile" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Current password or recovery code"), {
    target: { value: "a long password" },
  });
  fireEvent.click(button);
  expect(onDelete).toHaveBeenCalledWith("Personal", "a long password");
});
it("shows a readable credential error beside the password and clears it when editing", () => {
  render(
    <DeleteProfileDialog
      profile={{ ...profile, lockEnabled: true }}
      error="PROFILE_PASSWORD_INVALID: The password or recovery code is incorrect."
      onClose={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  const input = screen.getByLabelText("Current password or recovery code");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    "The password or recovery code is incorrect. Please try again.",
  );
  expect(screen.queryByText(/PROFILE_PASSWORD_INVALID/)).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "corrected password" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it.each([
  ["PROFILE_COOLDOWN: Try again in 30 seconds.", "Too many attempts. Try again in 30 seconds."],
  [
    "PROFILE_UNAVAILABLE: internal database path",
    "We couldn’t delete this profile. Please try again.",
  ],
])("makes deletion errors readable: %s", (error, message) => {
  render(
    <DeleteProfileDialog profile={profile} error={error} onClose={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText(/PROFILE_/)).not.toBeInTheDocument();
});
