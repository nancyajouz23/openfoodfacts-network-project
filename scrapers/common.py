
import csv
import threading
import time

from pathlib import Path
from datetime import datetime, timezone

from config import (
    CSV_COLUMNS,
    REQUEST_LOG_COLUMNS,
    PRODUCT_REQUEST_INTERVAL,
    SEARCH_REQUEST_INTERVAL,
    NETWORK_RESULTS_DIR,
)


# 1. Thread-safe rate limiter

class RateLimiter:
    def __init__(self, interval_seconds=5.0):
        if interval_seconds <= 0:
            raise ValueError("Interval must be positive")

        self.interval = interval_seconds
        self.lock = threading.Lock()
        self.next_allowed = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()

            wait_time = max(
                0.0,
                self.next_allowed - now
            )

            if wait_time > 0:
                time.sleep(wait_time)

            self.next_allowed = (
                time.monotonic() + self.interval
            )

            return wait_time


# Shared rate limiters
product_limiter = RateLimiter(
    PRODUCT_REQUEST_INTERVAL
)

search_limiter = RateLimiter(
    SEARCH_REQUEST_INTERVAL
)


# 2. Save products as CSV

def save_products(products, filename):
    path = Path(filename)

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        path, "w", newline="", encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=CSV_COLUMNS,
            extrasaction="ignore"
        )

        writer.writeheader()

        for product in products:
            row = {
                column: product.get(column, "")
                for column in CSV_COLUMNS
            }
            writer.writerow(row)

    print(f"Saved {len(products)} products to {path}")


# 3. Log network requests

log_lock = threading.Lock()


def append_request_log(entry, filename=None):
    if filename is None:
        filename = (
            NETWORK_RESULTS_DIR / "request_log.csv"
        )

    path = Path(filename)

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with log_lock:
        file_exists = (
            path.exists()
            and path.stat().st_size > 0
        )

        row = {
            column: entry.get(column, "")
            for column in REQUEST_LOG_COLUMNS
        }

        if not row["timestamp_utc"]:
            row["timestamp_utc"] = (
                datetime.now(timezone.utc).isoformat()
            )

        with open(
            path, "a", newline="", encoding="utf-8"
        ) as file:

            writer = csv.DictWriter(
                file,
                fieldnames=REQUEST_LOG_COLUMNS
            )

            if not file_exists:
                writer.writeheader()

            writer.writerow(row)
