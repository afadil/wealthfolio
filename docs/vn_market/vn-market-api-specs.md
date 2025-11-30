# Vietnamese Market API Specifications

This document contains the reverse-engineered API specifications extracted from the `vnstock` Python library for implementing native Rust clients.

## Overview

| Provider | Base URL | Data Type | Auth Required |
|----------|----------|-----------|---------------|
| VCI (Vietcap) | `https://trading.vietcap.com.vn/api/` | Stocks, Indices | No |
| FMarket | `https://api.fmarket.vn/res/products` | Mutual Funds | No |
| SJC | `https://sjc.com.vn/GoldPrice/Services/PriceService.ashx` | Gold Prices | No |

---

## 1. VCI (Vietcap) - Stocks & Indices

### 1.1 Base Configuration

```
Base URL: https://trading.vietcap.com.vn/api/
GraphQL URL: https://trading.vietcap.com.vn/data-mt/graphql
```

### 1.2 Required Headers

```rust
let headers = [
    ("Accept", "application/json, text/plain, */*"),
    ("Accept-Language", "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7"),
    ("Content-Type", "application/json"),
    ("Referer", "https://trading.vietcap.com.vn/"),
    ("Origin", "https://trading.vietcap.com.vn/"),
    ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"),
];
```

### 1.3 Get All Symbols (Listing)

**Endpoint:** `GET /price/symbols/getAll`

**Response:**
```json
[
  {
    "id": 1,
    "symbol": "VNM",
    "board": "HSX",  // Exchange: HSX, HNX, UPCOM
    "type": "STOCK", // STOCK, ETF, BOND, etc.
    "organName": "Công ty Cổ phần Sữa Việt Nam",
    "organShortName": "Vinamilk",
    "enOrganName": "Vietnam Dairy Products JSC",
    "enOrganShortName": "Vinamilk"
  }
]
```

**Rust Implementation:**
```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VciSymbol {
    pub symbol: String,
    pub board: String,       // HSX -> HOSE, HNX, UPCOM
    #[serde(rename = "type")]
    pub asset_type: String,
    pub organ_name: String,
    pub organ_short_name: Option<String>,
}

async fn get_all_symbols(client: &Client) -> Result<Vec<VciSymbol>, Error> {
    let url = "https://trading.vietcap.com.vn/api/price/symbols/getAll";
    let response = client.get(url).headers(VCI_HEADERS).send().await?;
    response.json().await
}
```

### 1.4 Get Historical OHLC Data

**Endpoint:** `POST /chart/OHLCChart/gap-chart`

**Request Body:**
```json
{
  "timeFrame": "ONE_DAY",   // ONE_MINUTE, ONE_HOUR, ONE_DAY
  "symbols": ["VNM"],
  "to": 1735689600,         // Unix timestamp (end date)
  "countBack": 365          // Number of candles to fetch
}
```

**TimeFrame Mapping:**
```rust
const INTERVAL_MAP: [(&str, &str); 6] = [
    ("1m", "ONE_MINUTE"),
    ("5m", "ONE_MINUTE"),   // Requires resampling
    ("15m", "ONE_MINUTE"),  // Requires resampling
    ("1H", "ONE_HOUR"),
    ("1D", "ONE_DAY"),
    ("1W", "ONE_DAY"),      // Requires resampling
];
```

**Response:**
```json
[
  {
    "t": [1704067200, 1704153600, ...],  // Timestamps
    "o": [85.5, 86.0, ...],              // Open prices (in 1000 VND)
    "h": [86.2, 86.5, ...],              // High prices
    "l": [85.0, 85.5, ...],              // Low prices
    "c": [86.0, 86.2, ...],              // Close prices
    "v": [1500000, 1200000, ...]         // Volume
  }
]
```

**⚠️ IMPORTANT: Price values are in 1000 VND units. Multiply by 1000 to get actual VND.**

**Rust Implementation:**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OhlcRequest {
    pub time_frame: String,
    pub symbols: Vec<String>,
    pub to: i64,
    pub count_back: i32,
}

#[derive(Deserialize)]
pub struct OhlcResponse {
    pub t: Vec<i64>,   // timestamps
    pub o: Vec<f64>,   // open (multiply by 1000)
    pub h: Vec<f64>,   // high
    pub l: Vec<f64>,   // low
    pub c: Vec<f64>,   // close
    pub v: Vec<i64>,   // volume
}

async fn get_stock_history(
    client: &Client, 
    symbol: &str, 
    start: DateTime<Utc>, 
    end: DateTime<Utc>
) -> Result<Vec<Quote>, Error> {
    let url = "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart";
    let end_timestamp = end.timestamp();
    let days = (end - start).num_days() + 1;
    
    let payload = OhlcRequest {
        time_frame: "ONE_DAY".to_string(),
        symbols: vec![symbol.to_string()],
        to: end_timestamp,
        count_back: days as i32,
    };
    
    let response = client
        .post(url)
        .headers(VCI_HEADERS)
        .json(&payload)
        .send()
        .await?;
    
    let data: Vec<OhlcResponse> = response.json().await?;
    // Transform and multiply prices by 1000
    // ...
}
```

### 1.5 Index Symbol Mapping

```rust
const INDEX_MAPPING: [(&str, &str); 3] = [
    ("VNINDEX", "VNINDEX"),
    ("HNXINDEX", "HNXIndex"),
    ("UPCOMINDEX", "HNXUpcomIndex"),
];
```

---

## 2. FMarket - Mutual Funds

### 2.1 Base Configuration

```
Base URL: https://api.fmarket.vn/res/products
```

### 2.2 Required Headers

```rust
let headers = [
    ("Accept", "application/json, text/plain, */*"),
    ("Content-Type", "application/json"),
    ("Referer", "https://fmarket.vn/"),
    ("Origin", "https://fmarket.vn/"),
    ("User-Agent", "Mozilla/5.0 ..."),
];
```

### 2.3 Get Fund Listing

**Endpoint:** `POST /filter`

**Request Body:**
```json
{
  "types": ["NEW_FUND", "TRADING_FUND"],
  "issuerIds": [],
  "sortOrder": "DESC",
  "sortField": "navTo6Months",
  "page": 1,
  "pageSize": 100,
  "isIpo": false,
  "fundAssetTypes": [],       // [], ["BALANCED"], ["BOND"], ["STOCK"]
  "bondRemainPeriods": [],
  "searchField": "",
  "isBuyByReward": false,
  "thirdAppIds": []
}
```

**Response:**
```json
{
  "data": {
    "total": 50,
    "rows": [
      {
        "id": 23,
        "shortName": "VESAF",
        "name": "Quỹ Đầu tư Cổ phiếu Việt Nam",
        "code": "VESAFUND",
        "dataFundAssetType": { "name": "STOCK" },
        "owner": { "name": "VinaCapital" },
        "nav": 25000.5,
        "firstIssueAt": 1609459200000,  // Unix ms
        "productNavChange": {
          "navToPrevious": 0.5,
          "navTo1Months": 2.3,
          "navTo3Months": 5.1,
          "navTo6Months": 8.7,
          "navTo12Months": 15.2,
          "updateAt": 1704067200000
        }
      }
    ]
  }
}
```

**Rust Implementation:**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundFilterRequest {
    pub types: Vec<String>,
    pub page: i32,
    pub page_size: i32,
    pub search_field: String,
    // ... other fields
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FundInfo {
    pub id: i32,
    pub short_name: String,
    pub name: String,
    pub nav: Option<f64>,
}
```

### 2.4 Get Fund NAV History

**Endpoint:** `POST /product/get-nav-history`

**Request Body:**
```json
{
  "isAllData": 0,           // 0 = use date range, 1 = all data
  "productId": 23,          // Fund ID from listing
  "fromDate": "20240101",   // YYYYMMDD format
  "toDate": "20241231"      // YYYYMMDD format
}
```

**Response:**
```json
{
  "data": [
    {
      "navDate": "2024-01-15",
      "nav": 25100.5
    },
    {
      "navDate": "2024-01-16", 
      "nav": 25150.0
    }
  ]
}
```

**Rust Implementation:**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavHistoryRequest {
    pub is_all_data: i32,
    pub product_id: i32,
    pub from_date: String,  // YYYYMMDD
    pub to_date: String,    // YYYYMMDD
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavRecord {
    pub nav_date: String,
    pub nav: f64,
}

async fn get_fund_nav_history(
    client: &Client,
    fund_id: i32,
    start: &str,  // YYYY-MM-DD
    end: &str
) -> Result<Vec<NavRecord>, Error> {
    let url = "https://api.fmarket.vn/res/product/get-nav-history";
    
    let payload = NavHistoryRequest {
        is_all_data: 0,
        product_id: fund_id,
        from_date: start.replace("-", ""),
        to_date: end.replace("-", ""),
    };
    
    let response = client.post(url).json(&payload).send().await?;
    let result: ApiResponse<Vec<NavRecord>> = response.json().await?;
    Ok(result.data)
}
```

### 2.5 Get Fund Details

**Endpoint:** `GET /{fundId}`

**Response:** Contains top holdings, industry allocation, asset holdings.

---

## 3. SJC - Gold Prices

### 3.1 Base Configuration

```
URL: https://sjc.com.vn/GoldPrice/Services/PriceService.ashx
Data Available: From 2016-01-02
```

### 3.2 Required Headers

```rust
let headers = [
    ("Content-Type", "application/x-www-form-urlencoded"),
    ("Referer", "https://sjc.com.vn/bieu-do-gia-vang"),
    ("Origin", "https://sjc.com.vn"),
    ("User-Agent", "Mozilla/5.0 ..."),
];
```

### 3.3 Get Gold Price by Date

**Endpoint:** `POST /`

**Request Body (form-urlencoded):**
```
method=GetSJCGoldPriceByDate&toDate=15/01/2024
```

**Date format:** `DD/MM/YYYY`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "TypeName": "Vàng miếng SJC",
      "BranchName": "Hồ Chí Minh",
      "BuyValue": 79500000,
      "SellValue": 81500000
    }
  ]
}
```

**Rust Implementation:**
```rust
#[derive(Deserialize)]
pub struct SjcResponse {
    pub success: bool,
    pub data: Vec<SjcGoldPrice>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SjcGoldPrice {
    pub type_name: String,
    pub branch_name: String,
    pub buy_value: f64,
    pub sell_value: f64,
}

async fn get_sjc_gold_price(client: &Client, date: NaiveDate) -> Result<SjcGoldPrice, Error> {
    let url = "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx";
    let date_str = date.format("%d/%m/%Y").to_string();
    let body = format!("method=GetSJCGoldPriceByDate&toDate={}", date_str);
    
    let response = client
        .post(url)
        .headers(SJC_HEADERS)
        .body(body)
        .send()
        .await?;
    
    let result: SjcResponse = response.json().await?;
    
    if !result.success || result.data.is_empty() {
        return Err(Error::NoData);
    }
    
    // Return first item (usually SJC standard gold bar)
    Ok(result.data.into_iter().next().unwrap())
}
```

---

## 4. Rate Limiting Recommendations

Based on the Python implementation analysis:

| Provider | Recommended Rate | Notes |
|----------|-----------------|-------|
| VCI | 10 req/sec | Can handle burst |
| FMarket | 5 req/sec | More conservative |
| SJC | 2 req/sec | Historical data fetched day-by-day |

---

## 5. Error Handling

### Common Error Responses

```rust
pub enum MarketDataError {
    // Network errors
    ConnectionError(String),
    Timeout,
    
    // API errors
    RateLimited,
    InvalidSymbol(String),
    NoDataAvailable,
    
    // Parse errors
    InvalidResponse(String),
}
```

---

## 6. Implementation Checklist

### Phase 1: Core HTTP Clients
- [ ] Create `VciClient` with authentication headers
- [ ] Create `FMarketClient` with authentication headers
- [ ] Create `SjcClient` with authentication headers
- [ ] Add rate limiting layer

### Phase 2: Data Models
- [ ] Port `VnMarketQuote` struct (already exists)
- [ ] Add `VnFundInfo` struct
- [ ] Add `VnGoldPrice` struct

### Phase 3: Provider Implementation
- [ ] Implement `get_stock_history()` for VCI
- [ ] Implement `get_fund_nav_history()` for FMarket
- [ ] Implement `get_gold_history()` for SJC
- [ ] Add caching layer

### Phase 4: Integration
- [ ] Update existing `VnMarketProvider` to use new clients
- [ ] Add health check endpoints
- [ ] Add background refresh tasks

---

## 7. Testing

### Test Symbols

| Type | Symbol | Notes |
|------|--------|-------|
| Stock | VNM | Blue chip, high liquidity |
| Stock | FPT | Tech sector |
| Index | VNINDEX | Main index |
| Fund | VESAF | VinaCapital stock fund |
| Fund | TCBF | TCB bond fund |
| Gold | VN.GOLD | SJC gold bar |

### Sample cURL Commands

**Get Stock History:**
```bash
curl -X POST 'https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart' \
  -H 'Content-Type: application/json' \
  -H 'Referer: https://trading.vietcap.com.vn/' \
  -d '{"timeFrame":"ONE_DAY","symbols":["VNM"],"to":1735689600,"countBack":30}'
```

**Get Fund Listing:**
```bash
curl -X POST 'https://api.fmarket.vn/res/products/filter' \
  -H 'Content-Type: application/json' \
  -H 'Referer: https://fmarket.vn/' \
  -d '{"types":["NEW_FUND","TRADING_FUND"],"page":1,"pageSize":100}'
```

**Get Gold Price:**
```bash
curl -X POST 'https://sjc.com.vn/GoldPrice/Services/PriceService.ashx' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Referer: https://sjc.com.vn/bieu-do-gia-vang' \
  -d 'method=GetSJCGoldPriceByDate&toDate=15/01/2024'
```

---

*Document generated from vnstock v3.3.0 source code analysis*
