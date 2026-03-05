# Activity Search API

## Endpoint

- **Tauri command**: `search_activities`
- **REST**: `POST /activities/search`

## Parameters

| Parameter              | Type              | Default                 | Description                                    |
| ---------------------- | ----------------- | ----------------------- | ---------------------------------------------- |
| `page`                 | `i64`             | 0                       | Page number, **0-based**                       |
| `pageSize`             | `i64`             | 50                      | Number of items per page                       |
| `accountIdFilter`      | `string[]` / null | null                    | Filter by account IDs                          |
| `activityTypeFilter`   | `string[]` / null | null                    | Filter by activity type (BUY, SELL, etc.)      |
| `assetIdKeyword`       | `string` / null   | null                    | Search by asset ID or ticker symbol            |
| `sort`                 | `Sort` / null     | `{id:"date",desc:true}` | Sort field and direction                       |
| `needsReviewFilter`    | `bool` / null     | null                    | Filter for draft/review activities             |
| `dateFrom`             | `string` / null   | null                    | Start date filter, inclusive (YYYY-MM-DD)      |
| `dateTo`               | `string` / null   | null                    | End date filter, inclusive (YYYY-MM-DD)        |
| `instrumentTypeFilter` | `string[]` / null | null                    | Filter by instrument type (EQUITY, BOND, etc.) |

## Pagination

Pagination is **0-based**. The offset is calculated as `page * pageSize`.

The frontend uses two modes:

- **Infinite scroll** (`useInfiniteQuery`) — starts at page 0, increments by
  `allPages.length` for each subsequent page
- **Paginated** (`useQuery`) — `pageIndex` from TanStack Table (also 0-based)

### Response shape

```typescript
interface ActivitySearchResponse {
  data: ActivityDetails[];
  meta: {
    totalRowCount: number;
  };
}
```

## NULL asset edge case

Activities can have a `NULL` `asset_id` (e.g., cash deposits, withdrawals,
interest). The query uses a `LEFT JOIN` on the assets table so these rows are
always included. The `instrument_type` field on such rows will be `NULL` and
they will not match any `instrumentTypeFilter` value.

## Instrument type filter

The filter accepts canonical type strings: `EQUITY`, `CRYPTO`, `FX`, `OPTION`,
`METAL`, `BOND`. The SQL `WHERE` clause uses `IN (...)` on the `instrument_type`
column from the joined assets table.

Activities with NULL assets are excluded when an instrument type filter is
active, since they have no associated instrument type.

## Sort

The `sort` parameter accepts a field ID and direction:

```json
{ "id": "date", "desc": true }
```

Supported sort fields are determined by the column mapping in the repository
layer. The default sort is by date descending.
