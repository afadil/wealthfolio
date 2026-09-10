import { render, screen } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";
import { describe, expect, it } from "vitest";

const useDesktopDialog = () => false;

describe("dialog overflow containment", () => {
  it("constrains dialog children and allows footer actions to wrap", () => {
    render(
      <Dialog open useIsMobile={useDesktopDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Long dialog title</DialogTitle>
            <DialogDescription>Long dialog description</DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="dialog-footer">
            <div>
              <Button>First action</Button>
              <Button>Second action</Button>
              <Button>Third action</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("[&>*]:min-w-0");
    expect(screen.getByTestId("dialog-footer")).toHaveClass(
      "max-sm:[&_button]:whitespace-normal",
      "max-sm:[&_button]:shrink",
      "sm:flex-wrap",
    );
  });

  it("constrains alert dialog children and allows footer actions to wrap", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Long alert title</AlertDialogTitle>
            <AlertDialogDescription>Long alert description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter data-testid="alert-dialog-footer">
            <AlertDialogCancel>First action</AlertDialogCancel>
            <AlertDialogAction>Second action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByRole("alertdialog")).toHaveClass(
      "[&>*]:min-w-0",
      "max-h-[calc(100dvh-env(safe-area-inset-bottom,0px)-2rem)]",
      "overflow-y-auto",
    );
    expect(screen.getByTestId("alert-dialog-footer")).toHaveClass(
      "max-sm:[&_button]:whitespace-normal",
      "max-sm:[&_button]:shrink",
      "sm:flex-wrap",
    );
  });
});
