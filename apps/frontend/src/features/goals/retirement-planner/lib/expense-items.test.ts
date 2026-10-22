import { afterEach, expect, it, vi } from "vitest";
import { createExpenseItem } from "./expense-items";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([undefined, {}])("creates distinct expense IDs without crypto APIs (%j)", (crypto) => {
  vi.stubGlobal("crypto", crypto);
  vi.spyOn(Date, "now").mockReturnValue(1234);
  const first = createExpenseItem("Housing", 1000);
  const second = createExpenseItem("Travel", 200);
  expect(first.id).toBeTruthy();
  expect(second.id).not.toBe(first.id);
  expect(createExpenseItem("Existing", 10, { id: "saved-expense" }).id).toBe("saved-expense");
});
