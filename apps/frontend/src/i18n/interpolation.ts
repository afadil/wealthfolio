import { isolateBidi } from "@wealthfolio/ui/lib/formatting";
import type { i18n as I18n, InterpolationOptions } from "i18next";

// A letter from a script written left to right: any letter outside the
// right-to-left scripts.
const LEFT_TO_RIGHT_LETTER =
  /(?![\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}])\p{L}/u;

/**
 * Interpolation for an i18next instance rendered by React. React already
 * escapes HTML, so `escape` only isolates: in a right-to-left language a
 * `{{value}}` with left-to-right letters keeps its own direction, and
 * "Emergency Fund!" does not show as "!Emergency Fund". Values written in the
 * sentence's own direction (Arabic text, "3 أشهر") need no isolate and stay as
 * they are, and so do bare numbers, so "{{visible}}/{{total}}" keeps showing
 * "20/50", not "50/20". Left-to-right text is unchanged. Follows the
 * instance's active language, read at call time, which is also what
 * `<html dir>` derives from.
 *
 * Text that leaves the screen (stored names, files, the clipboard, native
 * dialogs) goes through `stripBidiControls` first.
 */
export function reactInterpolation(instance: I18n): InterpolationOptions {
  return {
    escapeValue: true,
    escape: (value: string) =>
      instance.language &&
      instance.dir(instance.language) === "rtl" &&
      LEFT_TO_RIGHT_LETTER.test(value)
        ? isolateBidi(value)
        : value,
  };
}
