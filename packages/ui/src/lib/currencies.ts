// Get translated currency name using Intl.DisplayNames API
export function getCurrencyLabel(currencyCode: string, language = 'en'): string {
  try {
    const displayNames = new Intl.DisplayNames([language], { type: 'currency' });
    const currencyName = displayNames.of(currencyCode);
    return `${currencyName} (${currencyCode})`;
  } catch (error) {
    // Fallback if DisplayNames not supported or currency code invalid
    return `${currencyCode}`;
  }
}

// Get all currencies with translated labels
export function getWorldCurrencies(language = 'en'): Array<{ label: string; value: string }> {
  return worldCurrencyCodes.map(code => ({
    label: getCurrencyLabel(code, language),
    value: code
  }));
}

// Currency codes only (used to generate labels dynamically)
const worldCurrencyCodes = [
  "USD", "CAD", "EUR", "GBP", "AUD", "HKD", "SGD", "JPY", "CHF", "CNY",
  "KRW", "INR", "BRL", "RUB", "ZAR", "NZD", "NOK", "SEK", "DKK", "PLN",
  "TRY", "ILS", "MXN", "TWD", "ARS", "AFN", "ALL", "DZD", "AOA", "AMD",
  "AWG", "AZN", "BSD", "BHD", "BDT", "BBD", "BYR", "BZD", "BMD", "BTN",
  "BOB", "BAM", "BWP", "BND", "BGN", "BIF", "KHR", "CVE", "KYD", "GQE",
  "XAF", "XPF", "CLP", "COP", "KMF", "CDF", "CRC", "HRK", "CUC", "CZK",
  "DJF", "DOP", "XCD", "EGP", "ERN", "EEK", "ETB", "FKP", "FJD", "GMD",
  "GEL", "GHS", "GIP", "GTQ", "GNF", "GYD", "HTG", "HNL", "HUF", "ISK",
  "IDR", "IRR", "IQD", "JMD", "JOD", "KZT", "KES", "KWD", "KGS", "LAK",
  "LVL", "LBP", "LSL", "LRD", "LYD", "LTL", "MOP", "MKD", "MGA", "MWK",
  "MYR", "MVR", "MRO", "MUR", "MDL", "MNT", "MAD", "MZM", "MMK", "NAD",
  "NPR", "ANG", "NIO", "NGN", "KPW", "OMR", "PKR", "PAB", "PGK", "PYG",
  "PEN", "PHP", "QAR", "RON", "SHP", "WST", "SAR", "RSD", "SCR", "SLL",
  "SBD", "SOS", "XDR", "LKR", "SDG", "SRD", "SZL", "SYP", "TJS", "TZS",
  "THB", "TTD", "TND", "TMT", "AED", "UGX", "UAH", "UYU", "UZS", "VUV",
  "VEB", "VND", "XOF", "YER", "ZMK", "ZWR"
];

// Legacy export for backward compatibility - defaults to English
export const worldCurrencies = getWorldCurrencies('en');
