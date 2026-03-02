import { ActivityType } from "@/lib/constants";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSelectOption } from "../components/forms/fields";
import type { ActivityFormValues } from "../config/activity-form-config";
import { useActivityForm } from "./use-activity-form";

const mutationMocks = vi.hoisted(() => ({
  addMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  saveMutateAsync: vi.fn(),
}));

vi.mock("./use-activity-mutations", () => ({
  useActivityMutations: () => ({
    addActivityMutation: {
      mutateAsync: mutationMocks.addMutateAsync,
      isPending: false,
      error: null,
      isError: false,
    },
    updateActivityMutation: {
      mutateAsync: mutationMocks.updateMutateAsync,
      isPending: false,
      error: null,
      isError: false,
    },
    saveActivitiesMutation: {
      mutateAsync: mutationMocks.saveMutateAsync,
      isPending: false,
      error: null,
      isError: false,
    },
  }),
}));

const accounts: AccountSelectOption[] = [
  { value: "acc-usd", label: "USD Account", currency: "USD" },
  { value: "acc-cad", label: "CAD Account", currency: "CAD" },
];

describe("useActivityForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationMocks.addMutateAsync.mockResolvedValue({});
    mutationMocks.updateMutateAsync.mockResolvedValue({});
    mutationMocks.saveMutateAsync.mockResolvedValue({});
  });

  it("preserves user-selected currency for DEPOSIT", async () => {
    const { result } = renderHook(() =>
      useActivityForm({
        accounts,
        selectedType: "DEPOSIT",
      }),
    );

    const formData = {
      accountId: "acc-usd",
      activityDate: new Date("2026-02-01T10:00:00.000Z"),
      amount: 1000,
      comment: "test",
      currency: "EUR",
      fxRate: 1.25,
    } as ActivityFormValues;

    await act(async () => {
      await result.current.handleSubmit(formData);
    });

    expect(mutationMocks.addMutateAsync).toHaveBeenCalledTimes(1);
    expect(mutationMocks.addMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-usd",
        activityType: ActivityType.DEPOSIT,
        currency: "EUR",
      }),
    );
  });

  it("falls back to account currency when DEPOSIT currency is empty", async () => {
    const { result } = renderHook(() =>
      useActivityForm({
        accounts,
        selectedType: "DEPOSIT",
      }),
    );

    const formData = {
      accountId: "acc-usd",
      activityDate: new Date("2026-02-01T10:00:00.000Z"),
      amount: 1000,
      comment: null,
      currency: "   ",
    } as ActivityFormValues;

    await act(async () => {
      await result.current.handleSubmit(formData);
    });

    expect(mutationMocks.addMutateAsync).toHaveBeenCalledTimes(1);
    expect(mutationMocks.addMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-usd",
        activityType: ActivityType.DEPOSIT,
        currency: "USD",
      }),
    );
  });

  it("preserves user-selected currency for external TRANSFER", async () => {
    const { result } = renderHook(() =>
      useActivityForm({
        accounts,
        selectedType: "TRANSFER",
      }),
    );

    const formData = {
      isExternal: true,
      direction: "in",
      accountId: "acc-usd",
      fromAccountId: "",
      toAccountId: "",
      activityDate: new Date("2026-02-01T10:00:00.000Z"),
      transferMode: "cash",
      amount: 250,
      assetId: null,
      quantity: null,
      unitPrice: null,
      comment: "external transfer",
      currency: "EUR",
      fxRate: 1.2,
      subtype: null,
      quoteMode: "MARKET",
    } as ActivityFormValues;

    await act(async () => {
      await result.current.handleSubmit(formData);
    });

    expect(mutationMocks.addMutateAsync).toHaveBeenCalledTimes(1);
    expect(mutationMocks.addMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-usd",
        activityType: ActivityType.TRANSFER_IN,
        currency: "EUR",
      }),
    );
  });
});
