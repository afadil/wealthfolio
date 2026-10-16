import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSelectOption } from "../../forms/fields";
import { MobileActivityForm } from "../mobile-activity-form";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock("@wealthfolio/ui/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

// The details step's own fields have their coverage; here it only fills the
// form the way a user would, so the real submit path runs.
let seed: Record<string, unknown> = {};
vi.mock("../mobile-details-step", () => ({
  MobileDetailsStep: () => {
    const { setValue } = useFormContext();
    return (
      <button
        type="button"
        onClick={() => {
          for (const [name, value] of Object.entries(seed)) setValue(name, value);
        }}
      >
        Fill details
      </button>
    );
  },
}));

const saveActivities = vi.fn();
const saveInternalTransferPair = vi.fn();
const noopMutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock("../../../hooks/use-activity-mutations", () => ({
  useActivityMutations: () => ({
    addActivityMutation: noopMutation,
    updateActivityMutation: noopMutation,
    deleteActivityMutation: noopMutation,
    duplicateActivityMutation: noopMutation,
    saveActivitiesMutation: { mutateAsync: saveActivities, isPending: false },
    saveInternalTransferPairMutation: { mutateAsync: saveInternalTransferPair, isPending: false },
    linkTransferActivitiesMutation: noopMutation,
    unlinkTransferActivitiesMutation: noopMutation,
  }),
}));

const accounts: AccountSelectOption[] = [
  { value: "acc_1", label: "Brokerage", currency: "USD" } as AccountSelectOption,
  { value: "acc_2", label: "Retirement", currency: "USD" } as AccountSelectOption,
];

async function submitSecuritiesTransfer(toAccountId: string) {
  seed = {
    accountId: "acc_1",
    toAccountId,
    transferMode: "securities",
    isExternal: false,
    direction: "out",
    activityDate: new Date("2026-01-15T00:00:00Z"),
    assetId: "AAPL",
    quantity: 10,
    unitPrice: 100,
    currency: "USD",
  };
  const user = userEvent.setup();
  render(<MobileActivityForm accounts={accounts} open onClose={vi.fn()} />);
  await user.click(screen.getByRole("radio", { name: /Transfer/i }));
  await user.click(screen.getByRole("button", { name: /Next/i }));
  await user.click(await screen.findByRole("button", { name: "Fill details" }));
  await user.click(screen.getByRole("button", { name: /Add Activity/i }));
}

describe("MobileActivityForm internal securities transfer", () => {
  beforeEach(() => {
    saveActivities.mockReset();
    saveInternalTransferPair.mockReset();
  });

  it("saves both legs between two accounts", async () => {
    await submitSecuritiesTransfer("acc_2");

    expect(saveActivities).toHaveBeenCalledTimes(1);
    const [{ creates }] = saveActivities.mock.calls[0] as [{ creates: { accountId: string }[] }];
    expect(creates.map((leg) => leg.accountId)).toEqual(["acc_1", "acc_2"]);
  });

  it("refuses a securities transfer into the same account", async () => {
    await submitSecuritiesTransfer("acc_1");

    expect(saveActivities).not.toHaveBeenCalled();
    expect(saveInternalTransferPair).not.toHaveBeenCalled();
  });
});
