import { invoke, isDesktop } from "./shared/platform";

/** Translate text using the app backend (MyMemory). Requires network. */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  // Tauri maps the single struct arg `req` in Rust to the `req` key in the payload.
  if (isDesktop) {
    return invoke<string>("translate_text", {
      req: { text, sourceLang, targetLang },
    });
  }
  return invoke<string>("translate_text", { text, sourceLang, targetLang });
}
