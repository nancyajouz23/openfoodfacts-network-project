#!/usr/bin/env bash
# One benchmark run: resolve OFF hosts -> start tcpdump -> run ONE scraper -> stop capture.
# Setup traffic is never inside the capture (plan 4.2).
#
# Usage (from the project root, in WSL/Linux, offenv active or PYTHON set):
#   bash networking/run_benchmark.sh <method> <run_id> [extra scraper args]
#
#   method : bs4 | selenium | api | api_threaded
#   run_id : 1, 2 or 3
#
# Examples:
#   bash networking/run_benchmark.sh bs4 1
#   bash networking/run_benchmark.sh selenium 2 --block-analytics
#   TLS_KEYLOG=1 bash networking/run_benchmark.sh bs4 1      # optional, plan 4.3
#
# Output:
#   networking/pcaps/<method>_run<n>.pcap          full capture (all traffic, gitignored)
#   networking/results/off_ips_<method>_run<n>.txt  Open Food Facts IPs at run time
#   networking/results/ss_<method>_run<n>.txt       `ss -tan` snapshots every 5 s
#   networking/results/pcap_bytes.csv               bytes total / OFF only (one row per run)
#   + the scraper's own request_log.csv and metrics_runs.csv rows

set -euo pipefail

METHOD="${1:-}"
RUN_ID="${2:-}"
shift 2 2>/dev/null || true

case "$METHOD" in
    bs4)          MODULE="scrapers.bs4_scraper" ;;
    selenium)     MODULE="scrapers.selenium_scraper" ;;
    api)          MODULE="scrapers.api_scraper" ;;
    api_threaded) MODULE="scrapers.api_threaded" ;;
    *) echo "Usage: bash networking/run_benchmark.sh <bs4|selenium|api|api_threaded> <run_id> [args]"; exit 1 ;;
esac
[[ "$RUN_ID" =~ ^[0-9]+$ ]] || { echo "run_id must be a number (1, 2, 3)"; exit 1; }

# Always work from the project root
cd "$(dirname "$0")/.."
[[ -f config.py ]] || { echo "Cannot find config.py; run from the project"; exit 1; }

PYTHON="${PYTHON:-$(command -v python || true)}"
"$PYTHON" -c "import requests, bs4, selenium" 2>/dev/null \
    || { echo "Python packages missing: run 'source ~/offenv/bin/activate' first"; exit 1; }

NAME="${METHOD}_run${RUN_ID}"
PCAP_DIR="networking/pcaps"
RESULTS_DIR="networking/results"
PCAP="$PCAP_DIR/$NAME.pcap"
IPS_FILE="$RESULTS_DIR/off_ips_$NAME.txt"
SS_FILE="$RESULTS_DIR/ss_$NAME.txt"
BYTES_CSV="$RESULTS_DIR/pcap_bytes.csv"
LOCK="/tmp/off_benchmark.lock"
# Plan 4.2 hosts + the Open Food Facts services the product page calls (seen in the pilot)
OFF_HOSTS="world.openfoodfacts.org images.openfoodfacts.org static.openfoodfacts.org
analytics.openfoodfacts.org robotoff.openfoodfacts.org api.folksonomy.openfoodfacts.org"

mkdir -p "$PCAP_DIR" "$RESULTS_DIR"

if [[ -e "$PCAP" ]]; then
    echo "$PCAP already exists. Delete it or use another run_id."; exit 1
fi

# One benchmark at a time on this machine (plan 3.3)
exec 9>"$LOCK"
flock -n 9 || { echo "Another benchmark is running. Wait for it to finish."; exit 1; }

# Ask for the sudo password now, not in the middle of the run
sudo -v

# 1. Resolve Open Food Facts hosts and save their IPs for the capture filter (plan 4.2)
echo "== Resolving Open Food Facts hosts"
: > "$IPS_FILE"
for host in $OFF_HOSTS; do
    getent ahosts "$host" | awk -v h="$host" '{print $1, h}' | sort -u >> "$IPS_FILE"
done
sort -u -o "$IPS_FILE" "$IPS_FILE"
cat "$IPS_FILE"

# Selenium: find chromedriver now, so Selenium Manager's online version check
# (googlechromelabs.github.io, ~5.7 MB) happens before the capture, not inside it.
if [[ "$METHOD" == "selenium" ]]; then
    OFF_CHROMEDRIVER=$("$PYTHON" -m scrapers.selenium_scraper --print-driver-path | tail -1)
    [[ -x "$OFF_CHROMEDRIVER" ]] || { echo "chromedriver not found: $OFF_CHROMEDRIVER"; exit 1; }
    export OFF_CHROMEDRIVER
    echo "== chromedriver: $OFF_CHROMEDRIVER"
fi

# Optional: TLS keys for Wireshark decryption (plan 4.3). Never commit this file.
if [[ "${TLS_KEYLOG:-0}" == "1" ]]; then
    export SSLKEYLOGFILE="$PWD/$PCAP_DIR/sslkeys_$NAME.log"
    echo "== TLS key log: $SSLKEYLOGFILE"
fi

# 2. Start the capture (all traffic: needed for the "total bandwidth" metric)
echo "== Starting tcpdump -> $PCAP"
sudo tcpdump -i any -s 0 -U -w "$PCAP" >/dev/null 2>"$RESULTS_DIR/tcpdump_$NAME.err" &
SUDO_PID=$!

stop_capture() {
    [[ -n "${SS_PID:-}" ]] && kill "$SS_PID" 2>/dev/null || true
    if [[ -n "${SUDO_PID:-}" ]]; then
        sudo pkill -INT -f "tcpdump -i any -s 0 -U -w $PCAP" 2>/dev/null || true
        wait "$SUDO_PID" 2>/dev/null || true
        SUDO_PID=""
    fi
}
trap stop_capture EXIT INT TERM

sleep 2   # let tcpdump open the interface
if ! ps -p "$SUDO_PID" >/dev/null; then    # (kill -0 fails on a root process)
    echo "tcpdump did not start:"; cat "$RESULTS_DIR/tcpdump_$NAME.err"; exit 1
fi

# Open TCP connections during the run (text version of the `ss -t -a` screenshot)
(
    while true; do
        echo "### $(date -u +%H:%M:%S)"
        # like the brief's `ss -t -a | grep python`, plus chrome; -p shows the process
        ss -tanp '( dport = :443 or dport = :80 )' 2>/dev/null | grep -E "State|python|chrome" || true
        sleep 5
    done
) > "$SS_FILE" &
SS_PID=$!

# 3. Run exactly one scraper
echo "== Running $MODULE --run-id $RUN_ID $*"
START=$(date +%s.%N)
set +e
"$PYTHON" -m "$MODULE" --run-id "$RUN_ID" "$@"
STATUS=$?
set -e
END=$(date +%s.%N)

# 4. Stop the capture
sleep 2   # last ACK/FIN packets
stop_capture
trap - EXIT INT TERM
sudo chown "$(id -u):$(id -g)" "$PCAP" 2>/dev/null || true

echo "== Scraper exit code $STATUS, wall time $(awk -v s="$START" -v e="$END" 'BEGIN{printf "%.1f", e-s}') s"

# 5. Count bytes: everything, and Open Food Facts IPs only
bash networking/pcap_bytes.sh "$PCAP" "$IPS_FILE" "$METHOD" "$RUN_ID" >> "$BYTES_CSV.tmp"
if [[ ! -s "$BYTES_CSV" ]]; then
    echo "method,run_id,pcap,packets_total,bytes_total,packets_off,bytes_off,bytes_loopback" > "$BYTES_CSV"
fi
cat "$BYTES_CSV.tmp" >> "$BYTES_CSV" && rm -f "$BYTES_CSV.tmp"
tail -1 "$BYTES_CSV"

echo "== Done: $PCAP"
echo "   Take your nload/iftop and ss screenshots for the report while the next run is going."
exit "$STATUS"
