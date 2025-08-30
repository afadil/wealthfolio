import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TradeMatcher } from './src/utils/trade-matcher.ts';
import { PerformanceCalculator } from './src/utils/performance-calculator.ts';
import { startOfMonth, endOfMonth } from 'date-fns';

// Helper to parse CSV
function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return headers.reduce((obj, header, i) => {
      const value = values[i];
      if (['quantity', 'unitPrice', 'fee', 'amount'].includes(header)) {
        obj[header] = value ? parseFloat(value) : 0;
      } else if (['date', 'createdAt', 'updatedAt'].includes(header)) {
        obj[header] = new Date(value);
      } else if (['isDraft'].includes(header)) {
        obj[header] = value === 'TRUE';
      } else {
        obj[header] = value;
      }
      return obj;
    }, {});
  });
}

// Main test function
async function runTest() {
  console.log('--- Running May P/L Calculation Test ---');

  // Load and parse activities
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.resolve(__dirname, 'activities_2025-08-25.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    console.error("Please ensure the activities_2025-08-25.csv file is in the addon's root folder.");
    return;
  }
  const csvData = fs.readFileSync(csvPath, 'utf-8');
  const activities = parseCSV(csvData).map((a) => ({ ...a, assetId: a.symbol })); // Mock assetId

  // Filter for relevant trading activities (BUY/SELL)
  const tradingActivities = activities.filter((a) => ['BUY', 'SELL'].includes(a.activityType));

  const methods = ['FIFO', 'LIFO', 'AVERAGE'];
  const feeOptions = [true, false];
  const results = {};
  const fxRates = { USD: 1.385550, CAD: 1.0 }; // Base currency is CAD, use actual app rate

  const may2025 = new Date('2025-05-15T12:00:00Z');
  const startDate = startOfMonth(may2025);
  const endDate = endOfMonth(may2025);

  methods.forEach((method) => {
    results[method] = {};
    feeOptions.forEach((includeFees) => {
      const tradeMatcher = new TradeMatcher({ lotMethod: method, includeFees });
      const { closedTrades } = tradeMatcher.matchTrades(tradingActivities);
      const performanceCalculator = new PerformanceCalculator(closedTrades);
      const mayPL = performanceCalculator.calculateRealizedPLForPeriod(
        startDate,
        endDate,
        fxRates,
      );
      results[method][includeFees] = mayPL;
    });
  });

  const appValue = 12402.19;

  console.log('\n--- P/L Calculation Comparison for May 2025 ---');
  console.log('Method   | Fees Included | Realized P/L (CAD)');
  console.log('---------|---------------|--------------------');
  for (const method of methods) {
    for (const includeFees of feeOptions) {
      console.log(
        `${method.padEnd(8)} | ${includeFees.toString().padEnd(13)} | ${results[method][
          includeFees
        ].toFixed(2)}`,
      );
    }
  }
  console.log('-------------------------------------------------');
  console.log(`App Value: $${appValue.toFixed(2)}`);
}

runTest().catch(console.error);

