#!/bin/bash
# Test script for positions JSON removal.
#
# Usage:
#   ./test-positions-removal.sh setup      # create test data (run once)
#   ./test-positions-removal.sh baseline   # capture all API responses
#   ./test-positions-removal.sh verify     # capture again and diff vs baseline
#   ./test-positions-removal.sh diff       # just diff existing captures
#   ./test-positions-removal.sh cleanup    # delete test accounts + data
#
# Workflow:
#   1. setup     → create accounts, activities, snapshots
#   2. baseline  → capture on old code (pre-commit)
#   3. [apply commit, rebuild, restart server]
#   4. verify    → capture on new code, diff against baseline
#   5. cleanup   → remove test data

set -uo pipefail

BASE_URL="http://spark.home.triantos.com:8088/api/v1"
RESULTS_DIR="/tmp/wf-positions-test"
MODE="${1:-help}"

ALTS_TEST_ACCT="fc9bf498-d2e5-4259-871c-b98905647816"
HOLDINGS_ACCT_FILE="$RESULTS_DIR/holdings_account_id.txt"
EUR_ACCT_FILE="$RESULTS_DIR/eur_account_id.txt"

TEST_DATES=(
    "2025-01-10"  # before any activity
    "2025-02-15"  # AAPL lot1 + NESN.SW, no sells yet
    "2025-05-01"  # AAPL lot1+2 + NESN.SW + option, before sells
    "2025-06-15"  # after partial AAPL sell + option close
    "2025-09-15"  # HOLDINGS account has both snapshots
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

api_post() { curl -s -X POST "$BASE_URL$1" -H "Content-Type: application/json" -d "$2"; }
api_get()  { curl -s "$BASE_URL$1"; }
api_del()  { curl -s -X DELETE "$BASE_URL$1"; }

create_activity() {
    local acct="$1" symbol="$2" type="$3" date="$4" qty="$5" price="$6" fee="${7:-0}" currency="${8:-USD}" exchange="${9:-}"

    local symbol_json="null"
    if [ -n "$symbol" ]; then
        if [ -n "$exchange" ]; then
            symbol_json="{\"symbol\": \"$symbol\", \"exchangeMic\": \"$exchange\"}"
        else
            symbol_json="{\"symbol\": \"$symbol\"}"
        fi
    fi

    local resp
    resp=$(api_post "/activities" "$(cat <<EOF
{
    "accountId": "$acct",
    "symbol": $symbol_json,
    "activityType": "$type",
    "activityDate": "${date}T12:00:00.000Z",
    "quantity": $qty,
    "unitPrice": $price,
    "fee": $fee,
    "currency": "$currency"
}
EOF
)")
    if echo "$resp" | jq -e '.id' > /dev/null 2>&1; then
        echo "    OK"
    else
        local msg=$(echo "$resp" | jq -r '.message // empty' 2>/dev/null)
        if echo "$msg" | grep -qi "duplicate"; then
            echo "    (already exists)"
        else
            echo "    ERROR: ${msg:-$resp}"
        fi
    fi
}

create_account() {
    local name="$1" type="$2" currency="$3" tracking="${4:-TRANSACTIONS}"
    api_post "/accounts" "$(cat <<EOF
{
    "name": "$name",
    "accountType": "$type",
    "currency": "$currency",
    "trackingMode": "$tracking",
    "isDefault": false,
    "isActive": true
}
EOF
)" | jq -r '.id'
}

wait_recalc() {
    echo "  Waiting for recalculation..."
    sleep 5
}

# ─── SETUP ────────────────────────────────────────────────────────────────────

do_setup() {
    mkdir -p "$RESULTS_DIR"
    echo "=== Setting up test data ==="

    # ── Account 1: Alts Test (existing, TRANSACTIONS, USD) ────────────────
    echo ""
    echo "--- Alts Test account ($ALTS_TEST_ACCT) ---"

    echo "  DEPOSIT \$50,000 on 2025-01-01"
    create_activity "$ALTS_TEST_ACCT" "" "DEPOSIT" "2025-01-01" 50000 1 0 "USD"

    echo "  BUY 100 AAPL @ \$150 on 2025-01-15"
    create_activity "$ALTS_TEST_ACCT" "AAPL" "BUY" "2025-01-15" 100 150 10 "USD" "XNAS"

    echo "  BUY 200 NESN @ CHF 95 on 2025-02-01"
    create_activity "$ALTS_TEST_ACCT" "NESN" "BUY" "2025-02-01" 200 95 15 "CHF" "XSWX"

    echo "  BUY 50 AAPL @ \$160 on 2025-03-01"
    create_activity "$ALTS_TEST_ACCT" "AAPL" "BUY" "2025-03-01" 50 160 10 "USD" "XNAS"

    echo "  BUY 5 MU270617C00600000 (option) @ \$3 on 2025-04-01"
    # Use existing option asset by ID (created by JB bridge)
    local opt_resp
    opt_resp=$(api_post "/activities" "$(cat <<OPTEOF
{
    "accountId": "$ALTS_TEST_ACCT",
    "symbol": {"id": "8fa46947-4d5e-4e19-85db-432a998767f3"},
    "activityType": "BUY",
    "activityDate": "2025-04-01T12:00:00.000Z",
    "quantity": 5,
    "unitPrice": 3,
    "fee": 5,
    "currency": "USD"
}
OPTEOF
)")
    if echo "$opt_resp" | jq -e '.id' > /dev/null 2>&1; then echo "    OK"; else echo "    $(echo "$opt_resp" | jq -r '.message // empty')"; fi

    echo "  SELL 30 AAPL on 2025-06-01 (partial, FIFO)"
    create_activity "$ALTS_TEST_ACCT" "AAPL" "SELL" "2025-06-01" 30 175 10 "USD" "XNAS"

    echo "  SELL 5 MU270617C00600000 (option) on 2025-06-15 (full close)"
    local optsell_resp
    optsell_resp=$(api_post "/activities" "$(cat <<OPTSEOF
{
    "accountId": "$ALTS_TEST_ACCT",
    "symbol": {"id": "8fa46947-4d5e-4e19-85db-432a998767f3"},
    "activityType": "SELL",
    "activityDate": "2025-06-15T12:00:00.000Z",
    "quantity": 5,
    "unitPrice": 0.50,
    "fee": 5,
    "currency": "USD"
}
OPTSEOF
)")
    if echo "$optsell_resp" | jq -e '.id' > /dev/null 2>&1; then echo "    OK"; else echo "    $(echo "$optsell_resp" | jq -r '.message // empty')"; fi

    echo "  WITHDRAWAL \$10,000 on 2025-07-01"
    create_activity "$ALTS_TEST_ACCT" "" "WITHDRAWAL" "2025-07-01" 10000 1 0 "USD"

    # ── Alternative asset (property) ──
    echo ""
    echo "--- Creating alternative asset ---"
    local prop_resp
    prop_resp=$(api_post "/alternative-assets" "$(cat <<EOF
{
    "kind": "property",
    "name": "Test Property 123 Main St",
    "currency": "USD",
    "currentValue": "500000",
    "valueDate": "2025-01-15",
    "purchasePrice": "450000",
    "purchaseDate": "2024-06-15",
    "accountId": "$ALTS_TEST_ACCT"
}
EOF
)")
    local prop_id
    prop_id=$(echo "$prop_resp" | jq -r '.assetId // empty' 2>/dev/null || echo "")
    if [ -n "$prop_id" ]; then
        echo "  Property asset: $prop_id"
        echo "  Adding second valuation..."
        curl -s -X PUT "$BASE_URL/alternative-assets/$prop_id/valuation" \
            -H "Content-Type: application/json" \
            -d '{"value": "515000", "date": "2025-06-15"}' > /dev/null
        echo "    OK"
    else
        echo "  Property: ${prop_resp:0:100}"
    fi

    # ── Recalculate Alts Test ──
    echo ""
    echo "  Recalculating Alts Test..."
    api_post "/portfolio/recalculate" "{\"accountIds\":[\"$ALTS_TEST_ACCT\"]}" > /dev/null 2>&1 || true
    wait_recalc

    # ── Account 2: Test HOLDINGS (HOLDINGS mode, USD) ─────────────────────
    echo ""
    echo "--- Creating Test HOLDINGS account ---"
    local holdings_acct
    holdings_acct=$(create_account "Test HOLDINGS Mode" "SECURITIES" "USD" "HOLDINGS")
    echo "$holdings_acct" > "$HOLDINGS_ACCT_FILE"
    echo "  Account ID: $holdings_acct"

    echo "  Saving snapshot 2025-06-01 (50 MSFT @ \$400, \$5000 cash)"
    api_post "/snapshots" "$(cat <<EOF
{
    "accountId": "$holdings_acct",
    "snapshotDate": "2025-06-01",
    "holdings": [
        {"symbol": "MSFT", "quantity": "50", "averageCost": "400", "currency": "USD"}
    ],
    "cashBalances": {"USD": "5000"}
}
EOF
)" > /dev/null 2>&1 || echo "  (may need different field names)"

    echo "  Saving snapshot 2025-09-01 (50 MSFT + 100 GOOG, \$3000 cash)"
    api_post "/snapshots" "$(cat <<EOF
{
    "accountId": "$holdings_acct",
    "snapshotDate": "2025-09-01",
    "holdings": [
        {"symbol": "MSFT", "quantity": "50", "averageCost": "420", "currency": "USD"},
        {"symbol": "GOOG", "quantity": "100", "averageCost": "170", "currency": "USD"}
    ],
    "cashBalances": {"USD": "3000"}
}
EOF
)" > /dev/null 2>&1 || echo "  (may need different field names)"

    echo "  Recalculating HOLDINGS account..."
    api_post "/portfolio/recalculate" "{\"accountIds\":[\"$holdings_acct\"]}" > /dev/null 2>&1 || true
    wait_recalc

    # ── Account 3: Test EUR (TRANSACTIONS, EUR) ───────────────────────────
    echo ""
    echo "--- Creating Test EUR account ---"
    local eur_acct
    eur_acct=$(create_account "Test EUR Account" "SECURITIES" "EUR" "TRANSACTIONS")
    echo "$eur_acct" > "$EUR_ACCT_FILE"
    echo "  Account ID: $eur_acct"

    echo "  DEPOSIT €50,000 on 2025-03-01"
    create_activity "$eur_acct" "" "DEPOSIT" "2025-03-01" 50000 1 0 "EUR"

    echo "  BUY 100 SAP @ €180 on 2025-03-15"
    create_activity "$eur_acct" "SAP" "BUY" "2025-03-15" 100 180 12 "EUR" "XETR"

    echo "  Recalculating EUR account..."
    api_post "/portfolio/recalculate" "{\"accountIds\":[\"$eur_acct\"]}" > /dev/null 2>&1 || true
    wait_recalc

    # ── Final: recalculate TOTAL ──
    echo ""
    echo "--- Recalculating all (TOTAL portfolio) ---"
    api_post "/portfolio/recalculate" '{}' > /dev/null 2>&1 || true
    wait_recalc

    echo ""
    echo "=== Setup complete ==="
    echo "Accounts:"
    echo "  Alts Test:      $ALTS_TEST_ACCT"
    echo "  Test HOLDINGS:  $holdings_acct"
    echo "  Test EUR:       $eur_acct"
    echo ""
    echo "Next: ./test-positions-removal.sh baseline"
}

# ─── CAPTURE ──────────────────────────────────────────────────────────────────

do_capture() {
    local outdir="$1"
    mkdir -p "$outdir"

    local holdings_acct eur_acct
    holdings_acct=$(cat "$HOLDINGS_ACCT_FILE" 2>/dev/null || echo "")
    eur_acct=$(cat "$EUR_ACCT_FILE" 2>/dev/null || echo "")

    # Parallel arrays for account labels and IDs
    local labels=("alts-test")
    local accts=("$ALTS_TEST_ACCT")
    if [ -n "$holdings_acct" ]; then labels+=("holdings-mode"); accts+=("$holdings_acct"); fi
    if [ -n "$eur_acct" ]; then labels+=("eur-account"); accts+=("$eur_acct"); fi

    local n=0 i f

    # ── Per-account: live holdings, snapshots, valuation history, historical holdings ──
    for ((i=0; i<${#labels[@]}; i++)); do
        local label="${labels[$i]}" acct="${accts[$i]}"
        echo "--- $label ---"

        n=$((n+1)); f="$(printf '%02d' $n)-holdings-live-$label.json"
        printf "%02d. holdings live... " "$n"
        api_get "/holdings?accountId=$acct" | jq -S '.' > "$outdir/$f"
        echo "$(jq 'length' "$outdir/$f") items"

        n=$((n+1)); f="$(printf '%02d' $n)-snapshots-$label.json"
        printf "%02d. snapshots... " "$n"
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

    # ── TOTAL portfolio ──
    echo "--- TOTAL ---"
    n=$((n+1)); f="$(printf '%02d' $n)-holdings-live-TOTAL.json"
    printf "%02d. holdings live... " "$n"
    api_get "/holdings?accountId=TOTAL" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") items"

    n=$((n+1)); f="$(printf '%02d' $n)-val-history-TOTAL.json"
    printf "%02d. valuation history... " "$n"
    api_get "/valuations/history?accountId=TOTAL&startDate=2025-01-01&endDate=2025-12-31" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") days"

    # ── Valuations latest (all accounts + TOTAL) ──
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

    # ── Net worth ──
    n=$((n+1)); f="$(printf '%02d' $n)-net-worth.json"
    printf "%02d. net worth (current)... " "$n"
    api_get "/net-worth" | jq -S '.' > "$outdir/$f"
    echo "captured"

    n=$((n+1)); f="$(printf '%02d' $n)-net-worth-history.json"
    printf "%02d. net worth history... " "$n"
    api_get "/net-worth/history?startDate=2025-01-01&endDate=2025-12-31" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") points"

    # ── Performance ──
    local perf_ids=""
    for ((i=0; i<${#accts[@]}; i++)); do
        [ -n "$perf_ids" ] && perf_ids="${perf_ids},"
        perf_ids="${perf_ids}\"${accts[$i]}\""
    done

    n=$((n+1)); f="$(printf '%02d' $n)-performance-simple.json"
    printf "%02d. performance simple... " "$n"
    api_post "/performance/accounts/simple" "{\"accountIds\":[$perf_ids]}" | jq -S '.' > "$outdir/$f"
    echo "captured"

    # ── Alternative holdings ──
    n=$((n+1)); f="$(printf '%02d' $n)-alternative-holdings.json"
    printf "%02d. alternative holdings... " "$n"
    api_get "/alternative-holdings" | jq -S '.' > "$outdir/$f"
    echo "$(jq 'length' "$outdir/$f") items"

    # ── Recalculate, then re-capture key endpoints ──
    echo ""
    echo "--- Post-recalculation ---"
    api_post "/portfolio/recalculate" '{}' > /dev/null 2>&1 || true
    wait_recalc

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

# ─── DIFF ─────────────────────────────────────────────────────────────────────

do_diff() {
    local bdir="$RESULTS_DIR/baseline"
    local vdir="$RESULTS_DIR/verify"

    [ ! -d "$bdir" ] && { echo "ERROR: no baseline. Run: $0 baseline"; exit 1; }
    [ ! -d "$vdir" ] && { echo "ERROR: no verify.   Run: $0 verify";   exit 1; }

    echo "=== Comparing baseline vs verify ==="
    echo ""

    local pass=0 fail=0 skip=0
    # Fields that change between runs (timestamps, etc.)
    local strip='.calculatedAt, .calculatedAtTimestamp, .updatedAt, .createdAt, .lastUpdated'

    for f in "$bdir"/*.json; do
        local name=$(basename "$f")
        local vf="$vdir/$name"

        [ ! -f "$vf" ] && { echo "SKIP: $name"; skip=$((skip+1)); continue; }

        local bn vn
        bn=$(jq -S "walk(if type == \"object\" then del($strip) else . end)" "$f"  2>/dev/null || cat "$f")
        vn=$(jq -S "walk(if type == \"object\" then del($strip) else . end)" "$vf" 2>/dev/null || cat "$vf")

        if [ "$bn" = "$vn" ]; then
            echo "PASS: $name"
            pass=$((pass+1))
        else
            echo "FAIL: $name"
            diff --color=always <(echo "$bn") <(echo "$vn") | head -30
            echo "  [...]"
            echo ""
            fail=$((fail+1))
        fi
    done

    echo ""
    echo "=== $pass passed, $fail failed, $skip skipped ==="
    [ "$fail" -gt 0 ] && exit 1 || true
}

# ─── CLEANUP ──────────────────────────────────────────────────────────────────

do_cleanup() {
    echo "=== Cleaning up ==="

    # Delete activities from Alts Test
    echo "Clearing Alts Test activities..."
    local ids
    ids=$(api_get "/activities/search" 2>/dev/null | jq -r '.activities[]?.id // empty' 2>/dev/null || echo "")
    # Try searching by account
    ids=$(api_post "/activities/search" "{\"page\":1,\"pageSize\":100,\"accountIdFilter\":[\"$ALTS_TEST_ACCT\"]}" 2>/dev/null | jq -r '.activities[]?.id // empty' 2>/dev/null || echo "")
    local count=0
    for id in $ids; do
        api_del "/activities/$id" > /dev/null 2>&1 || true
        count=$((count+1))
    done
    echo "  Deleted $count activities"

    # Delete test accounts
    for f in "$HOLDINGS_ACCT_FILE" "$EUR_ACCT_FILE"; do
        if [ -f "$f" ]; then
            local acct=$(cat "$f")
            echo "Deleting account $acct..."
            api_del "/accounts/$acct" > /dev/null 2>&1 || true
            rm "$f"
        fi
    done

    rm -rf "$RESULTS_DIR/baseline" "$RESULTS_DIR/verify"
    echo "=== Done ==="
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "$MODE" in
    setup)    do_setup ;;
    baseline) echo "Capturing BASELINE..."; do_capture "$RESULTS_DIR/baseline" ;;
    verify)   echo "Capturing VERIFY...";   do_capture "$RESULTS_DIR/verify"; do_diff ;;
    diff)     do_diff ;;
    cleanup)  do_cleanup ;;
    *)
        echo "Usage: $0 [setup|baseline|verify|diff|cleanup]"
        echo ""
        echo "  1. setup     create test accounts + activities + snapshots"
        echo "  2. baseline  capture API responses (old code)"
        echo "  3. [apply commit, rebuild, restart server]"
        echo "  4. verify    capture + diff against baseline (new code)"
        echo "  5. cleanup   remove test data"
        ;;
esac
