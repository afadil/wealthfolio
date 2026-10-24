/**
 * Pasted tables become CSV attachments, so `import_csv` reads the exact text
 * the user pasted instead of a copy the model writes into the tool call.
 */

const PASTED_CSV_BASENAME = "pasted";

/** Non-empty records; a line break inside quotes stays in its cell. */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let record = "";
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "\n" && !inQuotes) {
      records.push(record.replace(/\r$/, ""));
      record = "";
      continue;
    }
    record += char;
  }
  records.push(record);
  return records.filter((line) => line.trim() !== "");
}

function countFields(line: string, delimiter: string): number {
  let fields = 1;
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      fields++;
    }
  }
  return fields;
}

/**
 * Whether pasted text is a table: at least two non-empty records that all split
 * into the same number of fields on one delimiter. With comma or semicolon, the
 * first record must also read as a header (no digits) and every later row hold
 * a digit, so prose and instructions such as "Buy 10, AAPL" stay text.
 */
export function isPastedCsvTable(text: string): boolean {
  const lines = splitRecords(text);
  if (lines.length < 2) return false;
  const looksLikeHeaderAndRows =
    !/\d/.test(lines[0]) && lines.slice(1).every((line) => /\d/.test(line));

  return ["\t", ",", ";"].some((delimiter) => {
    if (delimiter !== "\t" && !looksLikeHeaderAndRows) return false;
    const fields = countFields(lines[0], delimiter);
    return fields >= 2 && lines.every((line) => countFields(line, delimiter) === fields);
  });
}

/** `pasted.csv`, or `pasted-2.csv` and so on when the name is taken. */
export function pastedCsvFileName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames);
  let name = `${PASTED_CSV_BASENAME}.csv`;
  for (let n = 2; taken.has(name); n++) {
    name = `${PASTED_CSV_BASENAME}-${n}.csv`;
  }
  return name;
}
