import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installLinuxUndoRedo } from "./linux-undo-redo";

const execCommand = vi.fn(() => true);

function press(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("installLinuxUndoRedo", () => {
  beforeAll(() => {
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    installLinuxUndoRedo();
  });

  beforeEach(() => {
    execCommand.mockClear();
    document.body.innerHTML = "";
  });

  it.each([
    ["<input>", { key: "z", ctrlKey: true }, "undo"],
    ["<input>", { key: "Z", ctrlKey: true, shiftKey: true }, "redo"],
    ["<textarea></textarea>", { key: "y", ctrlKey: true }, "redo"],
    ['<input type="number">', { key: "z", ctrlKey: true }, "undo"],
    ['<input type="email">', { key: "z", ctrlKey: true }, "undo"],
  ])("runs the command for %s %o", (html, init, command) => {
    document.body.innerHTML = html;

    const event = press(document.body.firstElementChild!, init);

    expect(execCommand).toHaveBeenCalledExactlyOnceWith(command);
    expect(event.defaultPrevented).toBe(true);
  });

  it("handles contenteditable elements", () => {
    const editor = document.body.appendChild(document.createElement("div"));
    // jsdom does not implement isContentEditable.
    Object.defineProperty(editor, "isContentEditable", { value: true });

    press(editor, { key: "z", ctrlKey: true });

    expect(execCommand).toHaveBeenCalledExactlyOnceWith("undo");
  });

  it.each([
    ["Alt", { key: "z", ctrlKey: true, altKey: true }],
    ["Meta", { key: "z", ctrlKey: true, metaKey: true }],
    ["no Ctrl", { key: "z" }],
    ["another key", { key: "x", ctrlKey: true }],
    ["Ctrl+Shift+Y", { key: "Y", ctrlKey: true, shiftKey: true }],
    ["composition", { key: "z", ctrlKey: true, isComposing: true }],
    ["legacy composition", { key: "z", ctrlKey: true, keyCode: 229 }],
  ])("ignores %s", (_, init) => {
    const input = document.body.appendChild(document.createElement("input"));

    const event = press(input, init);

    expect(execCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    "<button></button>",
    '<input type="checkbox">',
    '<input type="range">',
    '<input type="file">',
    "<input readonly>",
    "<textarea readonly></textarea>",
    "<input disabled>",
  ])("ignores %s", (html) => {
    document.body.innerHTML = html;

    const event = press(document.body.firstElementChild!, { key: "z", ctrlKey: true });

    expect(execCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves keys a field already handled", () => {
    const input = document.body.appendChild(document.createElement("input"));
    input.addEventListener("keydown", (e) => e.preventDefault());

    press(input, { key: "z", ctrlKey: true });

    expect(execCommand).not.toHaveBeenCalled();
  });
});
