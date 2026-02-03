const SAMPLE_CSV_CONTENT = `date,symbol,quantity,activityType,unitPrice,currency,fee,amount,fxRate,subtype
2024-01-15,MSFT,10,BUY,380.50,USD,4.95,,,
2024-01-20,AAPL,5,BUY,185.25,USD,4.95,,,
2024-02-01,MSFT,1,DIVIDEND,0.75,USD,0,0.75,,QUALIFIED
2024-02-15,$CASH-USD,1,DEPOSIT,1,USD,0,1000.00,,
2024-03-01,AAPL,2,SELL,175.00,USD,4.95,,,
2024-03-10,VOO,3,BUY,450.00,USD,0,,,
2024-03-15,$CASH-USD,1,WITHDRAWAL,1,USD,0,500.00,,
2024-04-01,VOO,1,DIVIDEND,1.50,USD,0,1.50,,DRIP
2024-04-15,MSFT,5,SELL,410.00,USD,4.95,,,
2024-05-01,$CASH-USD,1,INTEREST,1,USD,0,12.50,,COUPON
2024-06-01,TD.TO,10,BUY,85.00,CAD,9.99,,1.36,`;

/**
 * Downloads the sample CSV template for activity imports.
 * The sample demonstrates all supported activity types and fields.
 * Uses Blob approach to work in both web and Tauri environments.
 */
export function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-import.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
