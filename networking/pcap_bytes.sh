#!/usr/bin/env bash
# Count packets and bytes in a capture: all traffic, and Open Food Facts IPs only.
# Same numbers as Wireshark -> Statistics -> Conversations (frame bytes).
#
# Usage: bash networking/pcap_bytes.sh <file.pcap> <off_ips.txt> [method] [run_id]
# Prints one CSV line:
#   method,run_id,pcap,packets_total,bytes_total,packets_off,bytes_off,bytes_loopback
# total = everything except loopback; off = Open Food Facts IPs only
# (run_benchmark.sh calls this automatically)

set -euo pipefail

PCAP="$1"
IPS_FILE="$2"
METHOD="${3:-}"
RUN_ID="${4:-}"

command -v tshark >/dev/null || { echo "tshark not installed (sudo apt install tshark)" >&2; exit 1; }

# "ip.addr in {a, b} or ipv6.addr in {c, d}" from the saved IP list
# (Wireshark 4.x needs commas between set elements)
V4=$(awk '$1 !~ /:/ {print $1}' "$IPS_FILE" | sort -u | paste -sd, - | sed 's/,/, /g')
V6=$(awk '$1 ~ /:/ {print $1}' "$IPS_FILE" | sort -u | paste -sd, - | sed 's/,/, /g')
FILTER=""
[[ -n "$V4" ]] && FILTER="ip.addr in {$V4}"
[[ -n "$V6" ]] && FILTER="${FILTER:+$FILTER or }ipv6.addr in {$V6}"
[[ -n "$FILTER" ]] || { echo "No IPs in $IPS_FILE" >&2; exit 1; }

count() {  # prints "packets bytes"; stops the script if tshark fails
    local lengths
    lengths=$(tshark -r "$PCAP" "$@" -T fields -e frame.len) \
        || { echo "tshark failed on $PCAP (filter: $FILTER)" >&2; exit 1; }
    awk '{p++; b+=$1} END {printf "%d %d", p, b}' <<< "$lengths"
}

# Loopback (127.0.0.1 / ::1) is local traffic, e.g. Selenium <-> chromedriver <-> Chrome
# control messages. It never leaves the machine, so it is kept out of "total".
LOOPBACK="ip.addr == 127.0.0.1 or ipv6.addr == ::1"

read -r P_ALL B_ALL <<< "$(count -Y "not ($LOOPBACK)")"
read -r P_OFF B_OFF <<< "$(count -Y "$FILTER")"
read -r P_LO B_LO <<< "$(count -Y "$LOOPBACK")"

echo "$METHOD,$RUN_ID,$(basename "$PCAP"),$P_ALL,$B_ALL,$P_OFF,$B_OFF,$B_LO"
