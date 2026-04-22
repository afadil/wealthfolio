#!/bin/bash

# Default values
LOG_FILE="/tmp/wealthfolio-dev2.log"
MAX_ATTEMPTS=60
INTERVAL=2
TAIL_LINES=25
PORT=8088

# Function to show usage
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Wait for both servers to be ready by checking the log file."
    echo ""
    echo "Options:"
    echo "  -l, --log-file LOG_FILE    Path to the log file (default: /tmp/wealthfolio-dev2.log)"
    echo "  -m, --max-attempts NUM     Maximum number of attempts (default: 60)"
    echo "  -i, --interval SEC         Interval between checks in seconds (default: 2)"
    echo "  -t, --tail-lines NUM       Number of lines to show at the end (default: 25)"
    echo "  -p, --port PORT            Port number to check for (default: 8088)"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "The script checks for 'ready in' and 'listening|:$PORT|Axum' in the log file."
}

# Parse options
while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        -m|--max-attempts)
            MAX_ATTEMPTS="$2"
            shift 2
            ;;
        -i|--interval)
            INTERVAL="$2"
            shift 2
            ;;
        -t|--tail-lines)
            TAIL_LINES="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate inputs
if ! [[ "$MAX_ATTEMPTS" =~ ^[0-9]+$ ]] || [ "$MAX_ATTEMPTS" -le 0 ]; then
    echo "Error: max-attempts must be a positive integer"
    exit 1
fi

if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -le 0 ]; then
    echo "Error: interval must be a positive integer"
    exit 1
fi

if ! [[ "$TAIL_LINES" =~ ^[0-9]+$ ]] || [ "$TAIL_LINES" -lt 0 ]; then
    echo "Error: tail-lines must be a non-negative integer"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -le 0 ] || [ "$PORT" -gt 65535 ]; then
    echo "Error: port must be an integer between 1 and 65535"
    exit 1
fi

# Wait loop
for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    if grep -q "ready in" "$LOG_FILE" 2>/dev/null && grep -qE "listening|:$PORT|Axum" "$LOG_FILE" 2>/dev/null; then
        echo "Both servers ready after $((i*INTERVAL))s"
        break
    fi
    sleep "$INTERVAL"
done

# Show tail of log
if [ -f "$LOG_FILE" ]; then
    tail -"$TAIL_LINES" "$LOG_FILE"
else
    echo "Log file $LOG_FILE does not exist or is not accessible."
fi
