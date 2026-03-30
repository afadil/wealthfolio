export interface CustomProviderSource {
  id: string;
  providerId: string;
  kind: "latest" | "historical";
  format: "json" | "html" | "html_table" | "csv";
  url: string;
  pricePath: string;
  datePath?: string;
  dateFormat?: string;
  currencyPath?: string;
  factor?: number;
  invert?: boolean;
  locale?: string;
  headers?: string;
  createdAt: string;
  updatedAt: string;
  highPath?: string;
  lowPath?: string;
  volumePath?: string;
  defaultPrice?: number;
  dateTimezone?: string;
}

export interface CustomProviderWithSources {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  sources: CustomProviderSource[];
}

export interface NewCustomProvider {
  code: string;
  name: string;
  description?: string;
  sources: NewCustomProviderSource[];
}

export interface UpdateCustomProvider {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  sources?: NewCustomProviderSource[];
}

export interface NewCustomProviderSource {
  kind: "latest" | "historical";
  format: "json" | "html" | "html_table" | "csv";
  url: string;
  pricePath: string;
  datePath?: string;
  dateFormat?: string;
  currencyPath?: string;
  factor?: number;
  invert?: boolean;
  locale?: string;
  headers?: string;
  highPath?: string;
  lowPath?: string;
  volumePath?: string;
  defaultPrice?: number;
  dateTimezone?: string;
}

export interface TestSourceRequest {
  format: "json" | "html" | "html_table" | "csv";
  url: string;
  pricePath: string;
  datePath?: string;
  dateFormat?: string;
  currencyPath?: string;
  factor?: number;
  invert?: boolean;
  locale?: string;
  headers?: string;
  symbol: string;
  highPath?: string;
  lowPath?: string;
  volumePath?: string;
  defaultPrice?: number;
  dateTimezone?: string;
}

export interface DetectedHtmlElement {
  selector: string;
  value: number;
  text: string;
  label: string;
  htmlContext: string;
}

export interface DetectedColumn {
  index: number;
  header: string;
  role?: string;
}

export interface DetectedHtmlTable {
  index: number;
  columns: DetectedColumn[];
  rowCount: number;
  sampleRows: string[][];
}

export interface TestSourceResult {
  success: boolean;
  price?: number;
  currency?: string;
  date?: string;
  error?: string;
  rawResponse?: string;
  detectedElements?: DetectedHtmlElement[];
  detectedTables?: DetectedHtmlTable[];
}
