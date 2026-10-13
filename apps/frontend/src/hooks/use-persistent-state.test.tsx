import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { expect, it, vi } from "vitest";
import { usePersistentState } from "@wealthfolio/ui";

it("synchronizes functional updates without updating another component during render", () => {
  const key = "persistent-state-render-test";
  localStorage.removeItem(key);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  function Editor() {
    const [value, setValue] = usePersistentState(key, 0);
    return (
      <button
        onClick={() => {
          setValue((previous) => previous + 1);
          setValue((previous) => previous + 1);
        }}
      >
        Count {value}
      </button>
    );
  }
  function Observer() {
    const [value] = usePersistentState(key, 0);
    return <output>{value}</output>;
  }
  try {
    render(
      <StrictMode>
        <Editor />
        <Observer />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Count 2");
    expect(screen.getByRole("status")).toHaveTextContent("2");
    expect(localStorage.getItem(key)).toBe("2");
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
    localStorage.removeItem(key);
  }
});
