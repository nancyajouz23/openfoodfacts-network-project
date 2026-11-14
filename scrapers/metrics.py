"""Shared helpers for benchmark runs: barcode list, run summary row, completeness.

Every scraper (BS4, Selenium, API, threaded API) should use these, so that
networking/results/metrics_runs.csv gets one comparable row per method x run.
Bandwidth columns are left blank here; they are filled from the pcap
(Wireshark -> Statistics -> Conversations) after the run.
"""

import csv
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from config import DATA_DIR, NETWORK_RESULTS_DIR

BENCHMARK_FILE = DATA_DIR / "barcodes_benchmark.csv"
METRICS_FILE = NETWORK_RESULTS_DIR / "metrics_runs.csv"

# Fields a scraper has to extract (barcode and category are given as input)
EXTRACTED_FIELDS = [
    "product_name", "brand", "sugar_100g", "fat_100g", "protein_100g",
    "salt_100g", "calories_100g", "nutriscore",
]
# A product counts as "extracted correctly" when all nutrition values are present
REQUIRED_FIELDS = ["sugar_100g", "fat_100g", "protein_100g", "salt_100g", "calories_100g"]

METRICS_COLUMNS = [
    "timestamp_utc", "method", "run_id",
    "products_attempted", "products_extracted", "reliability_pct",
    "field_completeness_pct", "http_requests", "http_errors",
    "body_bytes_received", "total_time_s", "wait_time_s", "active_time_s",
    "avg_latency_ms", "bandwidth_off_kb", "bandwidth_total_kb",
]


def load_benchmark_barcodes(path=BENCHMARK_FILE, limit=None):
    """Return [(barcode, category), ...]; barcodes stay text (leading zeros)."""
    df = pd.read_csv(path, dtype={"barcode": str})
    rows = list(df[["barcode", "category"]].itertuples(index=False, name=None))
    return rows[:limit] if limit else rows


def is_present(value):
    return value is not None and value != ""


def completeness(products):
    """(products extracted correctly, field completeness %) for a list of rows."""
    if not products:
        return 0, 0.0
    extracted = sum(all(is_present(p.get(f)) for f in REQUIRED_FIELDS) for p in products)
    present = sum(is_present(p.get(f)) for p in products for f in EXTRACTED_FIELDS)
    return extracted, round(100 * present / (len(products) * len(EXTRACTED_FIELDS)), 2)


def save_run_metrics(row, path=METRICS_FILE):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not path.exists() or path.stat().st_size == 0
    row = {c: row.get(c, "") for c in METRICS_COLUMNS}
    row["timestamp_utc"] = row["timestamp_utc"] or datetime.now(timezone.utc).isoformat()
    with open(path, "a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=METRICS_COLUMNS)
        if new_file:
            writer.writeheader()
        writer.writerow(row)
