#!/usr/bin/env bash
# UFW test (plan 4.4): block outgoing HTTPS, run each scraper on 1 product,
# record how it fails, then ALWAYS remove the rule again.
#
# Usage (project root, WSL/Linux, offenv active, UFW already enabled):
#   bash networking/firewall/ufw_test.sh                 # bs4 and selenium
#   bash networking/firewall/ufw_test.sh bs4 selenium api api_threaded
#
# Output: networking/firewall/ufw_<method>.txt (scraper output + timing)
# Each scraper retries 3 times with a 60 s back-off, so expect ~3-5 min per method.

set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ $# -gt 0 ]]; then METHODS=("$@"); else METHODS=(bs4 selenium); fi
PYTHON="${PYTHON:-$(command -v python || true)}"

declare -A MODULE=(
    [bs4]=scrapers.bs4_scraper
    [selenium]=scrapers.selenium_scraper
    [api]=scrapers.api_scraper
    [api_threaded]=scrapers.api_threaded
)

sudo -v
if ! sudo ufw status | grep -q "Status: active"; then
    echo "UFW is not active. Enable it first (you decide):"
    echo "    sudo ufw enable"
    echo "and disable it after the test if you want:  sudo ufw disable"
    exit 1
fi

# Selenium Manager needs HTTPS to look up chromedriver, so do it before blocking
OFF_CHROMEDRIVER=$("$PYTHON" -m scrapers.selenium_scraper --print-driver-path | tail -1)
[[ -x "$OFF_CHROMEDRIVER" ]] || { echo "chromedriver not found: $OFF_CHROMEDRIVER"; exit 1; }
export OFF_CHROMEDRIVER

remove_rule() {
    sudo ufw delete deny out 443 >/dev/null 2>&1 || true
    echo "== Rule removed: outgoing 443 allowed again"
}
trap remove_rule EXIT INT TERM

echo "== Blocking outgoing port 443"
sudo ufw deny out 443
sudo ufw status numbered | grep 443 || true

for method in "${METHODS[@]}"; do
    module="${MODULE[$method]:-}"
    [[ -n "$module" ]] || { echo "Unknown method $method"; continue; }
    out="networking/firewall/ufw_${method}.txt"
    echo "== $method (output in $out)"
    {
        echo "UFW test: sudo ufw deny out 443"
        echo "method: $method   started: $(date -u +%FT%TZ)"
        echo "----"
    } > "$out"
    start=$(date +%s.%N)
    set +e
    timeout 900 "$PYTHON" -m "$module" --limit 1 --run-id ufw >> "$out" 2>&1
    status=$?
    set -e
    end=$(date +%s.%N)
    {
        echo "----"
        echo "exit code: $status"
        echo "total time until the scraper gave up: $(awk -v s="$start" -v e="$end" 'BEGIN{printf "%.1f", e-s}') s"
    } >> "$out"
    tail -3 "$out"
done
# The per-attempt error type and time to fail are in networking/results/request_log_test.csv
# (rows with run_id = ufw).
