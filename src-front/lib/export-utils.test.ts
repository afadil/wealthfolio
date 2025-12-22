import { convertToCSV } from "./export-utils";

describe("convertToCSV", () => {
  it('should use "symbol" as header instead of "assetId"', () => {
    const dataWithAssetId = [
      { assetId: "AAPL", name: "Apple Inc.", quantity: 10 },
      { assetId: "GOOG", name: "Alphabet Inc.", quantity: 5 },
    ];
    const csvOutput = convertToCSV(dataWithAssetId);
    const [headerRow] = csvOutput.split("\n");

    expect(headerRow).toContain('"symbol"');
    expect(headerRow).not.toContain("assetId");
    // Check other headers to ensure they are preserved
    expect(headerRow).toContain('"name"');
    expect(headerRow).toContain('"quantity"');
  });

  it("should handle empty data", () => {
    const csvOutput = convertToCSV([]);
    expect(csvOutput).toBe("");
  });

  it("should correctly convert data to CSV format", () => {
    const data = [
      { id: 1, name: "Test 1", value: 100 },
      { id: 2, name: "Test 2", value: 200 },
    ];
    const csvOutput = convertToCSV(data);
    const rows = csvOutput.split("\n");

    expect(rows.length).toBe(3); // Header + 2 data rows
    expect(rows[0]).toBe('"id","name","value"');
    expect(rows[1]).toBe('"1","Test 1","100"');
    expect(rows[2]).toBe('"2","Test 2","200"');
  });

  it("should handle data with special characters in strings", () => {
    const data = [{ id: 1, description: 'Item with "quotes"', notes: "Comma, and new\nline" }];
    const csvOutput = convertToCSV(data);
    const rows = csvOutput.split("\n");

    expect(rows[0]).toBe('"id","description","notes"');
    // Values with quotes, commas, or newlines should be properly stringified
    expect(rows[1]).toBe('"1","Item with \\"quotes\\"","Comma, and new\\nline"');
  });

  it('should use "symbol" as header when assetId is present along with other columns', () => {
    const dataWithAssetIdAndOthers = [
      { assetId: "MSFT", type: "Stock", price: 300.5 },
      { assetId: "TSLA", type: "Stock", price: 700.75 },
    ];
    const csvOutput = convertToCSV(dataWithAssetIdAndOthers);
    const [headerRow] = csvOutput.split("\n");

    expect(headerRow).toContain('"symbol"');
    expect(headerRow).toContain('"type"');
    expect(headerRow).toContain('"price"');
    expect(headerRow).not.toContain("assetId");
  });
});
