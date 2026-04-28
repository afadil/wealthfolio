import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ParsedOccSymbol {
  underlying: string;
  expiration: string; // ISO date YYYY-MM-DD
  optionType: "CALL" | "PUT";
  strikePrice: number;
}

/**
 * Parse an OCC option symbol into its components.
 * Format: {underlying}{YYMMDD}{C|P}{strike×1000 as 8 digits}
 * Example: "AAPL240119C00195000" → AAPL, 2024-01-19, Call, $195.00
 * Returns null if the symbol is not a valid OCC symbol.
 */
export function parseOccSymbol(symbol: string): ParsedOccSymbol | null {
  const s = symbol.trim();
  const len = s.length;
  if (len < 15 || len > 21) return null;

  const strikeStr = s.slice(len - 8);
  const typeChar = s[len - 9]?.toUpperCase();
  const dateStr = s.slice(len - 15, len - 9);
  const underlying = s.slice(0, len - 15).trim();

  if (!underlying) return null;
  if (!/^\d{6}$/.test(dateStr)) return null;
  if (typeChar !== "C" && typeChar !== "P") return null;
  if (!/^\d{8}$/.test(strikeStr)) return null;

  const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10);
  const day = parseInt(dateStr.slice(4, 6), 10);

  const dateCheck = new Date(year, month - 1, day);
  if (dateCheck.getMonth() !== month - 1 || dateCheck.getDate() !== day) return null;

  const expiration = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const strikePrice = parseInt(strikeStr, 10) / 1000;

  return {
    underlying: underlying.toUpperCase(),
    expiration,
    optionType: typeChar === "C" ? "CALL" : "PUT",
    strikePrice,
  };
}

/**
 * Format an OCC symbol into a human-readable option description.
 * Returns null for non-option symbols.
 * Example: "AAPL240119C00195000" → "Jan 19 $195 CALL"
 */
export function formatOptionDescription(symbol: string): string | null {
  const parsed = parseOccSymbol(symbol);
  if (!parsed) return null;
  const exp = new Date(parsed.expiration + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${exp} $${parsed.strikePrice} ${parsed.optionType}`;
}
