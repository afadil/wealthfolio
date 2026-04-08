#!/bin/bash
# Integration test for the lots-based data model migration.
#
# Creates test accounts with diverse data (multi-currency equities, options,
# alternative assets, HOLDINGS-mode manual snapshots), captures API responses
# before and after a code change, and diffs the results.
#
# Usage:
#   ./scripts/test-lots-migration.sh setup      # create test data
#   ./scripts/test-lots-migration.sh baseline   # capture API responses
#   ./scripts/test-lots-migration.sh verify     # capture again + diff vs baseline
#   ./scripts/test-lots-migration.sh diff       # re-diff existing captures
#   ./scripts/test-lots-migration.sh cleanup    # remove all test data
#
# Workflow:
#   1. Start server on OLD code
#   2. setup     → create 3 test accounts with activities + snapshots
#   3. baseline  → capture ~37 API responses
#   4. Stop server, switch to NEW code, rebuild, start server
#   5. Recalculate test accounts (so lots reflect new code)
#   6. verify    → capture again, diff against baseline
#   7. cleanup   → delete test data
#
# Environment:
#   WF_BASE_URL  Server URL (default: http://localhost:8088/api/v1)
#   WF_TEST_DIR  Where to store captures (default: /tmp/wf-lots-test)
#
# Requires: curl, jq

set -uo pipefail

BASE_URL="${WF_BASE_URL:-http://localhost:8088/api/v1}"
RESULTS_DIR="${WF_TEST_DIR:-/tmp/wf-lots-test}"
MODE="${1:-help}"

# Account IDs are stored after setup so other steps can find them
USD_ACCT_FILE="$RESULTS_DIR/usd_account_id.txt"
HOLDINGS_ACCT_FILE="$RESULTS_DIR/holdings_account_id.txt"
EUR_ACCT_FILE="$RESULTS_DIR/eur_account_id.txt"
PROP_ASSET_FILE="$RESULTS_DIR/property_asset_id.txt"

# Historical dates to query (each exercises different position states)
TEST_DATES=(
    "2025-01-10"  # before any activity → empty
    "2025-02-15"  # AAPL lot1 + NESN, no sells yet
    "2025-05-01"  # AAPL lot1+2 + NESN + NVDA option, before sells
    "2025-06-15"  # after partial AAPL sell + option full close
    "2025-09-15"  # HOLDINGS account has both snapshots
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

api_post() { curl -s -X POST "$BASE_URL$1" -H "Content-Type: application/json" -d "$2"; }
api_put()  { curl -s -X PUT  "$BASE_URL$1" -H "Content-Type: application/json" -d "$2"; }
api_get()  { curl -s "$BASE_URL$1"; }
api_del()  { curl -s -X DELETE "$BASE_URL$1"; }

# Create an activity. For options, pass kind as the 10th arg.
# Usage: create_activity ACCT SYMBOL TYPE DATE QTY PRICE [FEE] [CCY] [EXCHANGE] [KIND]
#
# The symbol JSON includes `quoteCcy` so the backend can auto-create the
# asset row if no provider can resolve the symbol. Without this, fresh DBs
# (no pre-existing assets, no internet provider access) reject the activity
# with "Quote currency is required. Please re-select the symbol."
create_activity() {
    local acct="$1" symbol="$2" type="$3" date="$4" qty="$5" price="$6"
    local fee="${7:-0}" currency="${8:-USD}" exchange="${9:-}" kind="${10:-}"

    local symbol_json="null"
    if [ -n "$symbol" ]; then
        symbol_json="{\"symbol\": \"$symbol\", \"quoteCcy\": \"$currency\""
        [ -n "$exchange" ] && symbol_json="$symbol_json, \"exchangeMic\": \"$exchange\""
        [ -n "$kind" ]     && symbol_json="$symbol_json, \"kind\": \"$kind\""
        symbol_json="$symbol_json}"
    fi

    local resp
    resp=$(api_post "/activities" "{
        \"accountId\": \"$acct\",
        \"symbol\": $symbol_json,
        \"activityType\": \"$type\",
        \"activityDate\": \"${date}T12:00:00.000Z\",
        \"quantity\": $qty,
        \"unitPrice\": $price,
        \"fee\": $fee,
        \"currency\": \"$currency\"
    }")
    if echo "$resp" | jq -e '.id' > /dev/null 2>&1; then
        echo "    OK ($(echo "$resp" | jq -r '.id'))"
    else
        local msg
        msg=$(echo "$resp" | jq -r '.message // empty' 2>/dev/null)
        if echo "$msg" | grep -qi "duplicate"; then
            echo "    (already exists)"
        else
            echo "    ERROR: ${msg:-$resp}"
            return 1
        fi
    fi
}

create_account() {
    local name="$1" type="$2" currency="$3" tracking="${4:-TRANSACTIONS}"
    local resp
    resp=$(api_post "/accounts" "{
        \"name\": \"$name\",
        \"accountType\": \"$type\",
        \"currency\": \"$currency\",
        \"trackingMode\": \"$tracking\",
        \"isDefault\": false,
        \"isActive\": true
    }")
    local id
    id=$(echo "$resp" | jq -r '.id // empty')
    if [ -z "$id" ]; then
        echo "ERROR creating account: $(echo "$resp" | jq -r '.message // empty')" >&2
        return 1
    fi
    echo "$id"
}

recalc_account() {
    local acct="$1"
    api_post "/portfolio/recalculate" "{\"accountIds\":[\"$acct\"]}" > /dev/null 2>&1 || true
    sleep 5
}

recalc_all() {
    api_post "/portfolio/recalculate" '{}' > /dev/null 2>&1 || true
    sleep 8
}

# ─── SETUP: Create 3 test accounts with diverse data ─────────────────────────

do_setup() {
    mkdir -p "$RESULTS_DIR"

    # Verify server is reachable
    if ! api_get "/accounts" > /dev/null 2>&1; then
        echo "ERROR: Cannot reach server at $BASE_URL"
        echo "Set WF_BASE_URL or start the server first."
        exit 1
    fi

    echo "=== Setting up test data ==="
    echo "Server: $BASE_URL"

    # ── Account 1: USD TRANSACTIONS account ───────────────────────────────
    # Tests: multi-lot FIFO, partial sells, options with contract_multiplier,
    #        cross-currency positions (CHF), cash deposits/withdrawals,
    #        alternative assets (property)
    echo ""
    echo "--- Creating USD test account ---"
    local usd_acct
    usd_acct=$(create_account "Lots Test - USD" "SECURITIES" "USD" "TRANSACTIONS")
    echo "$usd_acct" > "$USD_ACCT_FILE"
    echo "  Account ID: $usd_acct"

    echo "  DEPOSIT \$50,000"
    create_activity "$usd_acct" "" "DEPOSIT" "2025-01-01" 50000 1 0 "USD"

    echo "  BUY 100 AAPL @ \$150 (lot 1)"
    create_activity "$usd_acct" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS"

    echo "  BUY 200 NESN @ CHF 95 (cross-currency position)"
    create_activity "$usd_acct" "NESN" "BUY" "2025-02-01" 200 95 15 "CHF" "XSWX"

    echo "  BUY 50 AAPL @ \$160 (lot 2)"
    create_activity "$usd_acct" "AAPL" "BUY" "2025-03-01" 50 160 10 "USD" "XNAS"

    echo "  BUY 5 NVDA option @ \$8 (contract_multiplier test)"
    create_activity "$usd_acct" "NVDA250620C00130000" "BUY" "2025-04-01" 5 8 5 "USD" "" "OPTION"

    echo "  SELL 30 AAPL @ \$175 (partial FIFO sell)"
    create_activity "$usd_acct" "AAPL" "SELL" "2025-06-01" 30 175 10 "USD" "XNAS"

    echo "  SELL 5 NVDA option @ \$2 (full close)"
    create_activity "$usd_acct" "NVDA250620C00130000" "SELL" "2025-06-15" 5 2 5 "USD" "" "OPTION"

    echo "  WITHDRAWAL \$10,000"
    create_activity "$usd_acct" "" "WITHDRAWAL" "2025-07-01" 10000 1 0 "USD"

    # ── Alternative asset (property) linked to USD account ────────────────
    echo ""
    echo "--- Creating alternative asset (property) ---"
    local prop_resp
    prop_resp=$(api_post "/alternative-assets" "{
        \"kind\": \"property\",
        \"name\": \"Lots Test Property\",
        \"currency\": \"USD\",
        \"currentValue\": \"500000\",
        \"valueDate\": \"2025-01-15\",
        \"purchasePrice\": \"450000\",
        \"purchaseDate\": \"2024-06-15\",
        \"accountId\": \"$usd_acct\"
    }")
    local prop_id
    prop_id=$(echo "$prop_resp" | jq -r '.assetId // empty' 2>/dev/null || echo "")
    if [ -n "$prop_id" ]; then
        echo "$prop_id" > "$PROP_ASSET_FILE"
        echo "  Property asset: $prop_id"
        echo "  Adding second valuation..."
        api_put "/alternative-assets/$prop_id/valuation" '{"value": "515000", "date": "2025-06-15"}' > /dev/null
        echo "    OK"
    else
        echo "  ERROR: $(echo "$prop_resp" | jq -r '.message // empty' 2>/dev/null)"
    fi

    echo ""
    echo "  Recalculating USD account..."
    recalc_account "$usd_acct"

    # ── Account 2: HOLDINGS mode (manual snapshots) ───────────────────────
    # Tests: lots derived from manual snapshots, multiple snapshot dates,
    #        position changes between snapshots
    echo ""
    echo "--- Creating HOLDINGS test account ---"
    local holdings_acct
    holdings_acct=$(create_account "Lots Test - HOLDINGS" "SECURITIES" "USD" "HOLDINGS")
    echo "$holdings_acct" > "$HOLDINGS_ACCT_FILE"
    echo "  Account ID: $holdings_acct"

    echo "  Saving snapshot 2025-06-01 (50 MSFT @ \$400, \$5000 cash)"
    api_post "/snapshots" "{
        \"accountId\": \"$holdings_acct\",
        \"snapshotDate\": \"2025-06-01\",
        \"holdings\": [
            {\"symbol\": \"MSFT\", \"quantity\": \"50\", \"averageCost\": \"400\", \"currency\": \"USD\"}
        ],
        \"cashBalances\": {\"USD\": \"5000\"}
    }" > /dev/null 2>&1

    echo "  Saving snapshot 2025-09-01 (50 MSFT + 100 GOOG, \$3000 cash)"
    api_post "/snapshots" "{
        \"accountId\": \"$holdings_acct\",
        \"snapshotDate\": \"2025-09-01\",
        \"holdings\": [
            {\"symbol\": \"MSFT\", \"quantity\": \"50\", \"averageCost\": \"420\", \"currency\": \"USD\"},
            {\"symbol\": \"GOOG\", \"quantity\": \"100\", \"averageCost\": \"170\", \"currency\": \"USD\"}
        ],
        \"cashBalances\": {\"USD\": \"3000\"}
    }" > /dev/null 2>&1

    echo "  Recalculating HOLDINGS account..."
    recalc_account "$holdings_acct"

    # ── Account 3: EUR TRANSACTIONS account ───────────────────────────────
    # Tests: non-USD base currency, FX conversion in valuations,
    #        cross-currency TOTAL portfolio aggregation
    echo ""
    echo "--- Creating EUR test account ---"
    local eur_acct
    eur_acct=$(create_account "Lots Test - EUR" "SECURITIES" "EUR" "TRANSACTIONS")
    echo "$eur_acct" > "$EUR_ACCT_FILE"
    echo "  Account ID: $eur_acct"

    echo "  DEPOSIT €50,000"
    create_activity "$eur_acct" "" "DEPOSIT" "2025-03-01" 50000 1 0 "EUR"

    echo "  BUY 100 SAP @ €180"
    create_activity "$eur_acct" "SAP" "BUY" "2025-03-15" 100 180 12 "EUR" "XETR"

    echo "  Recalculating EUR account..."
    recalc_account "$eur_acct"

    # ── Recalculate TOTAL portfolio ───────────────────────────────────────
    echo ""
    echo "--- Recalculating all (TOTAL portfolio) ---"
    recalc_all

    echo ""
    echo "=== Setup complete ==="
    echo "Accounts created:"
    echo "  USD (TRANSACTIONS): $usd_acct"
    echo "  HOLDINGS:           $holdings_acct"
    echo "  EUR (TRANSACTIONS): $eur_acct"
    [ -n "$prop_id" ] && echo "  Property asset:     $prop_id"
    echo ""
    echo "Next: $0 baseline"
}

# ─── CAPTURE: Hit every affected API endpoint and save responses ──────────────

do_capture() {
    local outdir="$1"
    mkdir -p "$outdir"

    # Load account IDs from setup
    local usd_acct holdings_acct eur_acct
    usd_acct=$(cat "$USD_ACCT_FILE" 2>/dev/null || echo "")
    holdings_acct=$(cat "$HOLDINGS_ACCT_FILE" 2>/dev/null || echo "")
    eur_acct=$(cat "$EUR_ACCT_FILE" 2>/dev/null || echo "")

    if [ -z "$usd_acct" ]; then
        echo "ERROR: No test accounts found. Run: $0 setup"
        exit 1
    fi

    local labels=("usd-transactions")
    local accts=("$usd_acct")
    [ -n "$holdings_acct" ] && { labels+=("holdings-mode"); accts+=("$holdings_acct"); }
    [ -n "$eur_acct" ]      && { labels+=("eur-transactions"); accts+=("$eur_acct"); }

    local n=0 i f

    # ── Per-account endpoints ─────────────────────────────────────────────
    for ((i=0; i<${#labels[@]}; i++)); do
        local label="${labels[$i]}" acct="${accts[$i]}"
        echo "--- $label ---"

        n=$((n+1)); f="$(printf '%02d' $n)-holdings-live-$label.json"
        printf "%02d. holdings live... " "$n"
        api_get "/holdings?accountId=$acct" | jq -S '.' > "$outdir/$f"
        echo "$(jq 'length' "$outdir/$f") items"

        n=$((n+1)); f="$(printf '%02d' $n)-snapshots-$label.json"
        printf "%02d. snapshots list... " "$n"
        api_get "/snapshots?accountId=$acct" | jq -S '.' > "$outdir/$f"
        echo "$(jq 'length' "$outdir/$f") snapshots"

        n=$((n+1)); f="$(printf '%02d' $n)-val-history-$label.json"
        printf "%02d. valuation history... " "$n"
        api_get "/valuations/history?accountId=$acct&startDate=2025-01-01&endDate=2025-12-31" | jq -S '.' > "$outdir/$f"
        echo "$(jq 'length' "$outdir/$f") days"

        for date in "${TEST_DATES[@]}"; do
            n=$((n+1)); f="$(printf '%02d' $n)-holdings-at-${date}-${label}.json"
            printf "%02d. holdings @ %s... " "$n" "$date"
            api_get "/snapshots/holdings?accountId=$acct&date=$date" | jq -S '.' > "$outdir/$f" 2>/dev/null || echo "[]" > "$outdir/$f"
            echo "$(jq 'length' "$outdir/$f") items"
        done
        echo ""
    done

    # ── TOTAL portfolio ───────────────────────────────────────────────────
    echo "--- TOTAL ---"
    n=$((n+1)); f="$(printf '%02d' $n)-holdings-live-TOTAL.json"
    printf "%02d. holdings live... " "$n"
    api_get "/holdings?accountId=TOTAL" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") items"

    n=$((n+1)); f="$(printf '%02d' $n)-val-history-TOTAL.json"
    printf "%02d. valuation history... " "$n"
    api_get "/valuations/history?accountId=TOTAL&startDate=2025-01-01&endDate=2025-12-31" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") days"

    # ── Cross-account endpoints ───────────────────────────────────────────
    echo ""
    echo "--- Cross-account ---"
    local params=""
    for ((i=0; i<${#accts[@]}; i++)); do
        params="${params}&accountIds=${accts[$i]}"
    done
    params="${params}&accountIds=TOTAL"

    n=$((n+1)); f="$(printf '%02d' $n)-valuations-latest.json"
    printf "%02d. valuations latest... " "$n"
    api_get "/valuations/latest?${params#&}" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") valuations"

    n=$((n+1)); f="$(printf '%02d' $n)-net-worth.json"
    printf "%02d. net worth... " "$n"
    api_get "/net-worth" | jq -S '.' > "$outdir/$f"
    echo "captured"

    n=$((n+1)); f="$(printf '%02d' $n)-net-worth-history.json"
    printf "%02d. net worth history... " "$n"
    api_get "/net-worth/history?startDate=2025-01-01&endDate=2025-12-31" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") points"

    local perf_ids=""
    for ((i=0; i<${#accts[@]}; i++)); do
        [ -n "$perf_ids" ] && perf_ids="${perf_ids},"
        perf_ids="${perf_ids}\"${accts[$i]}\""
    done

    n=$((n+1)); f="$(printf '%02d' $n)-performance-simple.json"
    printf "%02d. performance simple... " "$n"
    api_post "/performance/accounts/simple" "{\"accountIds\":[$perf_ids]}" | jq -S '.' > "$outdir/$f"
    echo "captured"

    n=$((n+1)); f="$(printf '%02d' $n)-alternative-holdings.json"
    printf "%02d. alternative holdings... " "$n"
    api_get "/alternative-holdings" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") items"

    # ── Post-recalculation ────────────────────────────────────────────────
    echo ""
    echo "--- Post-recalculation ---"
    echo "  Recalculating all..."
    recalc_all

    for ((i=0; i<${#labels[@]}; i++)); do
        local label="${labels[$i]}" acct="${accts[$i]}"
        n=$((n+1)); f="$(printf '%02d' $n)-holdings-post-recalc-$label.json"
        printf "%02d. holdings post-recalc [%s]... " "$n" "$label"
        api_get "/holdings?accountId=$acct" | jq -S '.' > "$outdir/$f"
        echo "$(jq 'length' "$outdir/$f") items"
    done

    n=$((n+1)); f="$(printf '%02d' $n)-holdings-post-recalc-TOTAL.json"
    printf "%02d. holdings post-recalc [TOTAL]... " "$n"
    api_get "/holdings?accountId=TOTAL" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") items"

    n=$((n+1)); f="$(printf '%02d' $n)-valuations-latest-post-recalc.json"
    printf "%02d. valuations latest post-recalc... " "$n"
    api_get "/valuations/latest?${params#&}" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") valuations"

    n=$((n+1)); f="$(printf '%02d' $n)-net-worth-post-recalc.json"
    printf "%02d. net worth post-recalc... " "$n"
    api_get "/net-worth" | jq -S '.' > "$outdir/$f"
    echo "captured"

    echo ""
    echo "=== Captured $n results to $outdir ==="
}

# ─── DIFF: Compare baseline vs verify with tolerance for expected changes ─────

do_diff() {
    local bdir="$RESULTS_DIR/baseline"
    local vdir="$RESULTS_DIR/verify"

    [ ! -d "$bdir" ] && { echo "ERROR: no baseline. Run: $0 baseline"; exit 1; }
    [ ! -d "$vdir" ] && { echo "ERROR: no verify.   Run: $0 verify";   exit 1; }

    echo "=== Comparing baseline vs verify ==="
    echo ""

    local pass=0 fail=0 skip=0
    # Strip volatile fields before comparison
    local strip='.calculatedAt, .calculatedAtTimestamp, .updatedAt, .createdAt, .lastUpdated, .asOfDate'
    # Sort arrays by a stable key to avoid HashMap ordering noise
    local sort_expr='if type == "array" then sort_by(.instrument.symbol // .localCurrency // .accountId // .snapshotDate // .id // "") else . end'

    for f in "$bdir"/*.json; do
        local name
        name=$(basename "$f")
        local vf="$vdir/$name"

        [ ! -f "$vf" ] && { echo "SKIP: $name"; skip=$((skip+1)); continue; }

        local bn vn
        bn=$(jq -S "walk(if type == \"object\" then del($strip) else . end) | $sort_expr" "$f"  2>/dev/null || cat "$f")
        vn=$(jq -S "walk(if type == \"object\" then del($strip) else . end) | $sort_expr" "$vf" 2>/dev/null || cat "$vf")

        if [ "$bn" = "$vn" ]; then
            echo "PASS: $name"
            pass=$((pass+1))
        else
            # Categorize the difference
            local changes
            changes=$(diff <(echo "$bn") <(echo "$vn") | grep "^[<>]" | head -5)
            local category="DIFF"
            if echo "$changes" | grep -q "originalQuantity"; then
                category="NEW_FIELD"
            elif echo "$changes" | grep -q "fxRate\|dayChange\|marketValue\|weight\|unrealizedGain\|investmentMarketValue\|totalValue"; then
                category="FX_DRIFT"
            elif echo "$changes" | grep -q "positionCount"; then
                category="POS_COUNT"
            elif echo "$changes" | grep -q '"quantity"'; then
                category="QTY_FIX"
            fi

            case "$category" in
                NEW_FIELD)  echo "NEW_FIELD: $name (originalQuantity added — expected)" ;;
                FX_DRIFT)   echo "FX_DRIFT:  $name (live market data changed between captures)" ;;
                POS_COUNT)  echo "POS_COUNT: $name (lot-based per-date count — improved)" ;;
                QTY_FIX)    echo "QTY_FIX:   $name (corrected historical quantity — improved)" ;;
                *)
                    echo "FAIL: $name"
                    diff --color=auto <(echo "$bn") <(echo "$vn") | head -20
                    echo "  [...]"
                    echo ""
                    ;;
            esac
            fail=$((fail+1))
        fi
    done

    echo ""
    echo "=== $pass exact matches, $fail differences, $skip skipped ==="
    echo ""
    echo "Expected difference types:"
    echo "  NEW_FIELD  — new originalQuantity field in lot display data"
    echo "  FX_DRIFT   — live FX/market rates changed between baseline and verify"
    echo "  POS_COUNT  — positionCount now derived per-date from lots (was static from JSON)"
    echo "  QTY_FIX    — historical quantities corrected via activity replay"
    echo "  FAIL       — unexpected difference (investigate)"
}

# ─── REGRESSION SCENARIOS ────────────────────────────────────────────────────
#
# Each scenario creates its own isolated test account, batches its setup
# activities, performs one mutation, waits once for the queue worker, then
# runs all its assertions before tearing down. They are independent — a
# failing scenario doesn't prevent others from running.
#
# Why batched:
#  - Recalcs are the slowest part of the test (~15s wait per worker cycle).
#  - Creating activities one at a time would queue many recalcs back-to-back;
#    the queue worker coalesces them anyway, so a single wait at the end is
#    equivalent in coverage and much faster.
#  - When a scenario fails, the assertion that fails (and the scenario name)
#    pinpoints the bug — no need to test "both paths" for every change.
#
# Selecting individual scenarios for debugging:
#   ./test-lots-migration.sh regression          # all scenarios
#   ./test-lots-migration.sh regression 1        # only scenario 1
#   ./test-lots-migration.sh regression 3        # only scenario 3

REGRESSION_PASS=0
REGRESSION_FAIL=0
REGRESSION_FAILED_SCENARIOS=""

# Wait long enough for queue worker debounce + market sync + recalc + lot
# sync to complete. Default 8s in recalc_all isn't always enough on cold
# starts; use 15s here for thoroughness.
WORKER_WAIT=15

wait_worker() {
    local label="${1:-worker}"
    echo "    waiting ${WORKER_WAIT}s for $label..."
    sleep "$WORKER_WAIT"
}

# Assertion helpers. Each call increments the global pass/fail counts and
# prints PASS/FAIL with the message. Scenarios continue after failures so
# one bug doesn't mask others.
assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "    PASS: $label (= $expected)"
        REGRESSION_PASS=$((REGRESSION_PASS+1))
    else
        echo "    FAIL: $label — expected '$expected', got '$actual'"
        REGRESSION_FAIL=$((REGRESSION_FAIL+1))
    fi
}

assert_decimal_eq() {
    # Compare two decimal strings as numbers, tolerating trailing zeros
    # and minor precision drift (10^-6).
    local label="$1" expected="$2" actual="$3"
    local norm_e norm_a
    norm_e=$(printf '%s' "$expected" | awk '{printf "%.6f", $1+0}')
    norm_a=$(printf '%s' "$actual" | awk '{printf "%.6f", $1+0}')
    if [ "$norm_e" = "$norm_a" ]; then
        echo "    PASS: $label (= $expected)"
        REGRESSION_PASS=$((REGRESSION_PASS+1))
    else
        echo "    FAIL: $label — expected $expected, got $actual"
        REGRESSION_FAIL=$((REGRESSION_FAIL+1))
    fi
}

# Returns total number of security holdings (excludes cash) for an account.
account_security_count() {
    local acct="$1"
    api_get "/holdings?accountId=$acct" \
        | jq '[.[] | select(.holdingType == "security")] | length'
}

# Returns total quantity of a given symbol held in an account. 0 if absent.
account_holding_qty() {
    local acct="$1" symbol="$2"
    api_get "/holdings?accountId=$acct" \
        | jq -r --arg s "$symbol" \
            '[.[] | select(.instrument.symbol == $s) | .quantity | tonumber] | add // 0'
}

# Create an activity and return its id (or empty on failure). Used when
# the test needs the id back for a later DELETE. Same quoteCcy handling as
# create_activity above.
create_activity_id() {
    local acct="$1" symbol="$2" type="$3" date="$4" qty="$5" price="$6"
    local fee="${7:-0}" currency="${8:-USD}" exchange="${9:-}" kind="${10:-}"
    local symbol_json="null"
    if [ -n "$symbol" ]; then
        symbol_json="{\"symbol\": \"$symbol\", \"quoteCcy\": \"$currency\""
        [ -n "$exchange" ] && symbol_json="$symbol_json, \"exchangeMic\": \"$exchange\""
        [ -n "$kind" ]     && symbol_json="$symbol_json, \"kind\": \"$kind\""
        symbol_json="$symbol_json}"
    fi
    api_post "/activities" "{
        \"accountId\": \"$acct\",
        \"symbol\": $symbol_json,
        \"activityType\": \"$type\",
        \"activityDate\": \"${date}T12:00:00.000Z\",
        \"quantity\": $qty,
        \"unitPrice\": $price,
        \"fee\": $fee,
        \"currency\": \"$currency\"
    }" | jq -r '.id // empty'
}

scenario_failed() {
    REGRESSION_FAILED_SCENARIOS="${REGRESSION_FAILED_SCENARIOS}\n  - $1"
}

# Internal-consistency invariant: SUM(lots.remaining_quantity) per asset must
# match the quantity reported by /holdings. Catches divergence between the
# lots table (source of truth) and the API read path. Skipped silently if
# WF_DB_PATH is unset or sqlite3 isn't available.
assert_lots_match_holdings() {
    local acct="$1"
    local db="${WF_DB_PATH:-./db/web-dev.db}"
    if [ ! -f "$db" ] || ! command -v sqlite3 > /dev/null 2>&1; then
        return
    fi
    local lots_csv holdings_csv mismatch
    lots_csv=$(sqlite3 -separator , "$db" \
        "SELECT asset_id, printf('%.6f', SUM(CAST(remaining_quantity AS REAL))) \
         FROM lots WHERE account_id='$acct' AND is_closed=0 \
         GROUP BY asset_id ORDER BY asset_id")
    holdings_csv=$(api_get "/holdings?accountId=$acct" \
        | jq -r '[.[] | select(.holdingType == "security")]
                  | sort_by(.instrument.id)
                  | .[] | "\(.instrument.id),\(.quantity | tonumber | . * 1000000 | round / 1000000 | tostring)"' \
        | awk -F, '{printf "%s,%.6f\n", $1, $2}')
    if [ "$lots_csv" = "$holdings_csv" ]; then
        echo "    PASS: lots table matches /holdings (sum-of-lots invariant)"
        REGRESSION_PASS=$((REGRESSION_PASS+1))
    else
        echo "    FAIL: lots table != /holdings"
        echo "      lots:     $(echo "$lots_csv" | tr '\n' ';')"
        echo "      holdings: $(echo "$holdings_csv" | tr '\n' ';')"
        REGRESSION_FAIL=$((REGRESSION_FAIL+1))
    fi
}

# ── Scenario 1: incremental recalc preserves lots ────────────────────────────
#
# Reproduces the PR #820 regression where adding a new activity to an
# account with existing security positions would trigger a queue-worker
# recalc that loaded the start state from the DB (with empty positions
# post-column-drop) and replayed only the new activity, producing an
# empty result that wiped the account's lots via sync_lots_for_account.
#
# Setup: account with 2 BUYs that establish open lots.
# Mutation: add a DIVIDEND (cash-only activity, doesn't add positions).
# Expected: lot count and position quantities unchanged.
scenario_1_incremental_recalc_preserves_lots() {
    echo ""
    echo "=== Scenario 1: incremental recalc preserves lots ==="

    local acct
    acct=$(create_account "Regr - Incremental" "SECURITIES" "USD" "TRANSACTIONS")
    if [ -z "$acct" ]; then
        echo "  ERROR: failed to create test account"
        scenario_failed "scenario_1_incremental_recalc_preserves_lots"
        return
    fi
    echo "  Account: $acct"

    # Batch all setup activities, then recalc once.
    create_activity "$acct" "" "DEPOSIT" "2025-01-01" 50000 1 0 "USD" > /dev/null
    create_activity "$acct" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS" > /dev/null
    create_activity "$acct" "MSFT" "BUY" "2025-02-01" 50 400 10 "USD" "XNAS" > /dev/null

    recalc_account "$acct"
    wait_worker "initial recalc"

    # Baseline: 2 security positions (AAPL + MSFT).
    assert_eq "baseline has 2 security positions" "2" "$(account_security_count "$acct")"
    assert_decimal_eq "baseline AAPL quantity" "100" "$(account_holding_qty "$acct" "AAPL")"
    assert_decimal_eq "baseline MSFT quantity" "50" "$(account_holding_qty "$acct" "MSFT")"

    # Mutation: add a cash dividend. This is the trigger that broke things —
    # it queues an incremental portfolio job that loaded the start state
    # from the DB and replayed only the dividend.
    echo "  Adding DIVIDEND (cash-only, must not affect positions)..."
    create_activity "$acct" "AAPL" "DIVIDEND" "2025-03-01" 0 0 0 "USD" "XNAS" > /dev/null

    wait_worker "post-dividend queue worker"

    # Critical assertions: positions are still there after the incremental recalc.
    assert_eq "lots preserved after dividend" "2" "$(account_security_count "$acct")"
    assert_decimal_eq "post-dividend AAPL quantity" "100" "$(account_holding_qty "$acct" "AAPL")"
    assert_decimal_eq "post-dividend MSFT quantity" "50" "$(account_holding_qty "$acct" "MSFT")"
    assert_lots_match_holdings "$acct"

    api_del "/accounts/$acct" > /dev/null 2>&1 || true
}

# ── Scenario 2: activity delete preserves OTHER accounts' lots ──────────────
#
# When an activity is deleted, the recalc fires for the affected account.
# Other accounts must not be touched — but recalc/cascade bugs can leak
# across accounts (e.g. a recalc-all triggered by domain events).
#
# Setup: two accounts, each with their own BUY.
# Mutation: delete the BUY in account 1.
# Expected: account 1 has no security positions; account 2 unchanged.
scenario_2_activity_delete_isolation() {
    echo ""
    echo "=== Scenario 2: activity delete is isolated to one account ==="

    local acct1 acct2
    acct1=$(create_account "Regr - Delete A" "SECURITIES" "USD" "TRANSACTIONS")
    acct2=$(create_account "Regr - Delete B" "SECURITIES" "USD" "TRANSACTIONS")
    if [ -z "$acct1" ] || [ -z "$acct2" ]; then
        echo "  ERROR: failed to create test accounts"
        scenario_failed "scenario_2_activity_delete_isolation"
        return
    fi
    echo "  Account A: $acct1"
    echo "  Account B: $acct2"

    create_activity "$acct1" "" "DEPOSIT" "2025-01-01" 50000 1 0 "USD" > /dev/null
    local buy_a
    buy_a=$(create_activity_id "$acct1" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS")
    if [ -z "$buy_a" ]; then
        echo "  ERROR: failed to create BUY in account A"
        api_del "/accounts/$acct1" > /dev/null 2>&1 || true
        api_del "/accounts/$acct2" > /dev/null 2>&1 || true
        scenario_failed "scenario_2_activity_delete_isolation"
        return
    fi

    create_activity "$acct2" "" "DEPOSIT" "2025-01-01" 50000 1 0 "USD" > /dev/null
    create_activity "$acct2" "MSFT" "BUY" "2025-01-15" 50 400 10 "USD" "XNAS" > /dev/null

    recalc_all
    wait_worker "initial recalc"

    assert_eq "baseline A has 1 security" "1" "$(account_security_count "$acct1")"
    assert_eq "baseline B has 1 security" "1" "$(account_security_count "$acct2")"

    # Mutation: delete A's BUY.
    echo "  Deleting BUY $buy_a from account A..."
    api_del "/activities/$buy_a" > /dev/null 2>&1 || true
    wait_worker "post-delete queue worker"

    # Account A should now have no security holdings.
    assert_eq "A has 0 securities after delete" "0" "$(account_security_count "$acct1")"
    # Account B must be untouched.
    assert_eq "B unchanged after delete" "1" "$(account_security_count "$acct2")"
    assert_decimal_eq "B MSFT quantity unchanged" "50" "$(account_holding_qty "$acct2" "MSFT")"
    assert_lots_match_holdings "$acct1"
    assert_lots_match_holdings "$acct2"

    api_del "/accounts/$acct1" > /dev/null 2>&1 || true
    api_del "/accounts/$acct2" > /dev/null 2>&1 || true
}

# ── Scenario 3: HOLDINGS-mode snapshot delete refreshes lots correctly ──────
#
# refresh_lots_from_latest_snapshot reads snapshot.positions from the DB.
# After the column drop, positions are empty — and the function would
# replace lots with an empty list, wiping the account.
#
# Setup: HOLDINGS-mode account with two manual snapshots:
#   S1 (50 MSFT) on 2025-06-01
#   S2 (50 MSFT + 100 GOOG) on 2025-09-01
# State: lots reflect S2 (latest).
# Mutation: delete S2.
# Expected: lots reflect S1 — 50 MSFT only, no GOOG.
scenario_3_holdings_snapshot_delete() {
    echo ""
    echo "=== Scenario 3: HOLDINGS snapshot delete refreshes lots ==="

    local acct
    acct=$(create_account "Regr - HOLDINGS Delete" "SECURITIES" "USD" "HOLDINGS")
    if [ -z "$acct" ]; then
        echo "  ERROR: failed to create HOLDINGS account"
        scenario_failed "scenario_3_holdings_snapshot_delete"
        return
    fi
    echo "  Account: $acct"

    # Batch both snapshots, then recalc once.
    api_post "/snapshots" "{
        \"accountId\": \"$acct\",
        \"snapshotDate\": \"2025-06-01\",
        \"holdings\": [
            {\"symbol\": \"MSFT\", \"quantity\": \"50\", \"averageCost\": \"400\", \"currency\": \"USD\"}
        ],
        \"cashBalances\": {\"USD\": \"5000\"}
    }" > /dev/null 2>&1
    api_post "/snapshots" "{
        \"accountId\": \"$acct\",
        \"snapshotDate\": \"2025-09-01\",
        \"holdings\": [
            {\"symbol\": \"MSFT\", \"quantity\": \"50\", \"averageCost\": \"420\", \"currency\": \"USD\"},
            {\"symbol\": \"GOOG\", \"quantity\": \"100\", \"averageCost\": \"170\", \"currency\": \"USD\"}
        ],
        \"cashBalances\": {\"USD\": \"3000\"}
    }" > /dev/null 2>&1

    recalc_account "$acct"
    wait_worker "initial recalc"

    # Baseline: lots reflect the LATEST snapshot (S2).
    assert_eq "baseline reflects S2 (2 positions)" "2" "$(account_security_count "$acct")"
    assert_decimal_eq "baseline MSFT quantity" "50" "$(account_holding_qty "$acct" "MSFT")"
    assert_decimal_eq "baseline GOOG quantity" "100" "$(account_holding_qty "$acct" "GOOG")"

    # Mutation: delete S2.
    echo "  Deleting S2 (2025-09-01)..."
    api_del "/snapshots?accountId=$acct&date=2025-09-01" > /dev/null 2>&1 || true
    wait_worker "post-snapshot-delete queue worker"

    # After deletion: lots should reflect S1 — only MSFT, no GOOG.
    assert_eq "lots reflect S1 (1 position)" "1" "$(account_security_count "$acct")"
    assert_decimal_eq "MSFT preserved from S1" "50" "$(account_holding_qty "$acct" "MSFT")"
    assert_decimal_eq "GOOG removed (came from deleted S2)" "0" "$(account_holding_qty "$acct" "GOOG")"
    assert_lots_match_holdings "$acct"

    api_del "/accounts/$acct" > /dev/null 2>&1 || true
}

# ── Scenario 4: recalc idempotency ──────────────────────────────────────────
#
# A pure recalc with no activity changes should produce identical state.
# This catches: hidden state in the calculator, FIFO ordering instability,
# float precision drift, and "first run vs subsequent run" bugs.
#
# Worth the extra wait cost — three recalcs is the only way to test this.
scenario_4_recalc_idempotency() {
    echo ""
    echo "=== Scenario 4: recalc idempotency (3 sequential recalcs) ==="

    local acct
    acct=$(create_account "Regr - Idempotency" "SECURITIES" "USD" "TRANSACTIONS")
    if [ -z "$acct" ]; then
        echo "  ERROR: failed to create test account"
        scenario_failed "scenario_4_recalc_idempotency"
        return
    fi
    echo "  Account: $acct"

    create_activity "$acct" "" "DEPOSIT" "2025-01-01" 100000 1 0 "USD" > /dev/null
    create_activity "$acct" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS" > /dev/null
    create_activity "$acct" "AAPL" "BUY" "2025-03-01" 50 160 10 "USD" "XNAS" > /dev/null
    create_activity "$acct" "MSFT" "BUY" "2025-02-01" 50 400 10 "USD" "XNAS" > /dev/null
    create_activity "$acct" "AAPL" "SELL" "2025-06-01" 30 175 10 "USD" "XNAS" > /dev/null

    recalc_account "$acct"
    wait_worker "first recalc"

    # Capture state after first recalc. Strip any volatile fields.
    local h1
    h1=$(api_get "/holdings?accountId=$acct" \
        | jq -S 'map({symbol: .instrument.symbol, type: .holdingType, qty: .quantity, cost: .costBasis.local}) | sort_by(.symbol // "")')

    recalc_account "$acct"
    wait_worker "second recalc"
    local h2
    h2=$(api_get "/holdings?accountId=$acct" \
        | jq -S 'map({symbol: .instrument.symbol, type: .holdingType, qty: .quantity, cost: .costBasis.local}) | sort_by(.symbol // "")')

    if [ "$h1" = "$h2" ]; then
        echo "    PASS: holdings identical between recalc 1 and recalc 2"
        REGRESSION_PASS=$((REGRESSION_PASS+1))
    else
        echo "    FAIL: holdings differ between recalc 1 and recalc 2"
        echo "    First:"
        printf '%s\n' "$h1" | sed 's/^/      /'
        echo "    Second:"
        printf '%s\n' "$h2" | sed 's/^/      /'
        REGRESSION_FAIL=$((REGRESSION_FAIL+1))
    fi

    recalc_account "$acct"
    wait_worker "third recalc"
    local h3
    h3=$(api_get "/holdings?accountId=$acct" \
        | jq -S 'map({symbol: .instrument.symbol, type: .holdingType, qty: .quantity, cost: .costBasis.local}) | sort_by(.symbol // "")')

    if [ "$h1" = "$h3" ]; then
        echo "    PASS: holdings identical between recalc 1 and recalc 3"
        REGRESSION_PASS=$((REGRESSION_PASS+1))
    else
        echo "    FAIL: third recalc diverges from first"
        REGRESSION_FAIL=$((REGRESSION_FAIL+1))
    fi
    assert_lots_match_holdings "$acct"

    api_del "/accounts/$acct" > /dev/null 2>&1 || true
}

# ── Scenario 5: holdings ↔ valuations consistency ───────────────────────────
#
# After a recalc, /holdings and /valuations/latest should agree on the
# total cost basis of an account. This is the broadest internal-consistency
# check we can do via the API.
scenario_5_holdings_valuations_consistency() {
    echo ""
    echo "=== Scenario 5: holdings ↔ valuations consistency ==="

    local acct
    acct=$(create_account "Regr - Consistency" "SECURITIES" "USD" "TRANSACTIONS")
    if [ -z "$acct" ]; then
        echo "  ERROR: failed to create test account"
        scenario_failed "scenario_5_holdings_valuations_consistency"
        return
    fi
    echo "  Account: $acct"

    create_activity "$acct" "" "DEPOSIT" "2025-01-01" 100000 1 0 "USD" > /dev/null
    create_activity "$acct" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS" > /dev/null
    create_activity "$acct" "MSFT" "BUY" "2025-02-01" 50 400 10 "USD" "XNAS" > /dev/null

    recalc_account "$acct"
    wait_worker "recalc"

    # Sum of cost basis from /holdings (security positions only).
    local holdings_cost
    holdings_cost=$(api_get "/holdings?accountId=$acct" \
        | jq -r '[.[] | select(.holdingType == "security") | .costBasis.local | tonumber] | add // 0')

    # Cost basis from /valuations/latest.
    local valuation_cost
    valuation_cost=$(api_get "/valuations/latest?accountIds=$acct" \
        | jq -r '.[] | .costBasis | tonumber')

    echo "  /holdings cost basis: $holdings_cost"
    echo "  /valuations cost basis: $valuation_cost"
    assert_decimal_eq "holdings cost basis matches valuations cost basis" \
        "$holdings_cost" "$valuation_cost"

    # Position quantities should match the BUYs we recorded.
    assert_decimal_eq "AAPL quantity" "100" "$(account_holding_qty "$acct" "AAPL")"
    assert_decimal_eq "MSFT quantity" "50" "$(account_holding_qty "$acct" "MSFT")"
    assert_lots_match_holdings "$acct"

    api_del "/accounts/$acct" > /dev/null 2>&1 || true
}

do_regression() {
    local only="${1:-}"

    if ! api_get "/accounts" > /dev/null 2>&1; then
        echo "ERROR: Cannot reach server at $BASE_URL"
        exit 1
    fi
    echo "=== Running regression scenarios ==="
    echo "Server: $BASE_URL"
    echo "Worker wait per step: ${WORKER_WAIT}s"

    # Ensure base currency is set so valuation FX (USD->USD self-rate) resolves.
    api_put "/settings" '{"baseCurrency":"USD"}' > /dev/null 2>&1 || true
    if [ -n "$only" ]; then
        echo "Only running scenario: $only"
    fi

    REGRESSION_PASS=0
    REGRESSION_FAIL=0
    REGRESSION_FAILED_SCENARIOS=""

    if [ -z "$only" ] || [ "$only" = "1" ]; then
        scenario_1_incremental_recalc_preserves_lots
    fi
    if [ -z "$only" ] || [ "$only" = "2" ]; then
        scenario_2_activity_delete_isolation
    fi
    if [ -z "$only" ] || [ "$only" = "3" ]; then
        scenario_3_holdings_snapshot_delete
    fi
    if [ -z "$only" ] || [ "$only" = "4" ]; then
        scenario_4_recalc_idempotency
    fi
    if [ -z "$only" ] || [ "$only" = "5" ]; then
        scenario_5_holdings_valuations_consistency
    fi

    echo ""
    echo "=== Regression summary ==="
    echo "Passed assertions: $REGRESSION_PASS"
    echo "Failed assertions: $REGRESSION_FAIL"
    if [ -n "$REGRESSION_FAILED_SCENARIOS" ]; then
        echo "Scenarios that errored before completion:"
        printf "%b\n" "$REGRESSION_FAILED_SCENARIOS"
    fi
    if [ "$REGRESSION_FAIL" -gt 0 ] || [ -n "$REGRESSION_FAILED_SCENARIOS" ]; then
        exit 1
    fi
}

# ─── CLEANUP: Delete all test accounts and data ──────────────────────────────

do_cleanup() {
    echo "=== Cleaning up test data ==="

    for label_file in "$USD_ACCT_FILE" "$HOLDINGS_ACCT_FILE" "$EUR_ACCT_FILE"; do
        if [ -f "$label_file" ]; then
            local acct
            acct=$(cat "$label_file")
            echo "Deleting account $acct..."
            api_del "/accounts/$acct" > /dev/null 2>&1 || true
            rm "$label_file"
        fi
    done

    if [ -f "$PROP_ASSET_FILE" ]; then
        local prop_id
        prop_id=$(cat "$PROP_ASSET_FILE")
        echo "Deleting property asset $prop_id..."
        api_del "/alternative-assets/$prop_id" > /dev/null 2>&1 || true
        rm "$PROP_ASSET_FILE"
    fi

    rm -rf "$RESULTS_DIR/baseline" "$RESULTS_DIR/verify"
    echo "=== Done ==="
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "$MODE" in
    setup)      do_setup ;;
    baseline)   echo "Capturing BASELINE..."; do_capture "$RESULTS_DIR/baseline" ;;
    verify)     echo "Capturing VERIFY...";   do_capture "$RESULTS_DIR/verify"; do_diff ;;
    diff)       do_diff ;;
    regression) do_regression "${2:-}" ;;
    cleanup)    do_cleanup ;;
    *)
        cat <<USAGE
Usage: $0 [setup|baseline|verify|diff|regression [N]|cleanup]

Integration test for the lots-based data model migration.
Two complementary modes:

  1. baseline → verify: capture API responses on old vs new code and diff.
     Validates that read paths produce identical output for the same state.

  2. regression: run mutation scenarios against the current code that
     specifically exercise state-migration and incremental-recalc paths.
     Each scenario creates its own account, performs a mutation, waits
     for the queue worker, and asserts invariants. Catches bugs that the
     baseline/verify diff misses (e.g. PR #820's positions-column-drop
     regression that wiped lots when an incremental recalc loaded an
     empty start state).

Commands:
  setup            Create 3 test accounts with activities, snapshots, alt assets
  baseline         Capture all API responses (run on old code)
  verify           Capture again and diff against baseline (run on new code)
  diff             Re-diff existing captures
  regression       Run all 5 regression scenarios against current code
  regression N     Run only scenario N (for narrowing failures)
                     1 = incremental recalc preserves lots
                     2 = activity delete is isolated to one account
                     3 = HOLDINGS snapshot delete refreshes lots
                     4 = recalc idempotency
                     5 = holdings ↔ valuations consistency
  cleanup          Delete all test accounts and data

Environment:
  WF_BASE_URL  Server URL (default: http://localhost:8088/api/v1)
  WF_TEST_DIR  Capture directory (default: /tmp/wf-lots-test)

Test data (baseline) covers:
  - Multi-lot FIFO (buy 100 + buy 50 AAPL, sell 30)
  - Cross-currency (CHF position in USD account, EUR account)
  - Options with contract_multiplier (NVDA call)
  - Alternative assets (property with two valuations)
  - HOLDINGS-mode account (manual snapshots at two dates)
  - TOTAL portfolio aggregation across all accounts
  - Historical as-of queries at 5 dates spanning the activity range

Regression mode runs are self-cleaning — each scenario tears down its
own test account.
USAGE
        ;;
esac
