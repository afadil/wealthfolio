import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./date-picker";

const { mockDatePickerInput } = vi.hoisted(() => ({
  mockDatePickerInput: vi.fn(
    ({ "data-testid": dataTestId }: { "data-testid": string; maxValue?: unknown }) => (
      <div data-testid={dataTestId} />
    ),
  ),
}));

vi.mock("@wealthfolio/ui", () => ({
  DatePickerInput: mockDatePickerInput,
  FormField: ({
    render,
  }: {
    render: (props: {
      field: {
        onChange: (date: Date | undefined) => void;
        value: Date | undefined;
        disabled: boolean;
      };
    }) => React.ReactNode;
  }) =>
    render({
      field: {
        onChange: vi.fn(),
        value: undefined,
        disabled: false,
      },
    }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));

function TestForm({ allowFutureDates }: { allowFutureDates?: boolean }) {
  const form = useForm<{ activityDate?: Date }>({
    defaultValues: { activityDate: undefined },
  });

  return (
    <FormProvider {...form}>
      <DatePicker name="activityDate" label="Date" allowFutureDates={allowFutureDates} />
    </FormProvider>
  );
}

describe("DatePicker", () => {
  beforeEach(() => {
    mockDatePickerInput.mockClear();
  });

  it("does not pass maxValue by default", () => {
    render(<TestForm />);

    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    expect(mockDatePickerInput.mock.lastCall?.[0]?.maxValue).toBeUndefined();
  });

  it("passes maxValue when future dates are explicitly disabled", () => {
    render(<TestForm allowFutureDates={false} />);

    expect(mockDatePickerInput.mock.lastCall?.[0]?.maxValue).toBeDefined();
  });
});
