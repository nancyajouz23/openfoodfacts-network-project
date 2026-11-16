
"""
Multithreaded Open Food Facts API scraper.

Uses 3 worker threads, each with its own HTTP session.
All workers share the same 5-second product rate limiter.

Examples:
    python -m scrapers.api_threaded --limit 3
    python -m scrapers.api_threaded --run-id 1
"""

import argparse
import threading
import time

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

from config import (
    API_FIELDS,
    NETWORK_RESULTS_DIR,
    PRODUCT_API_URL,
    PROCESSED_DIR,
    REQUEST_HEADERS,
    REQUEST_TIMEOUT,
)

from scrapers.common import (
    append_request_log,
    product_limiter,
    save_products,
)

from scrapers.metrics import (
    completeness,
    load_benchmark_barcodes,
    save_run_metrics,
)

from scrapers.api_scraper import (
    CountingSession,
    empty_product,
    parse_product,
)


METHOD = "api_threaded"
NUM_WORKERS = 3
MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 60

# Each thread receives its own requests.Session.
thread_data = threading.local()
sessions = []
sessions_lock = threading.Lock()


def get_session():
    """Create or reuse the HTTP session belonging to this thread."""

    if not hasattr(thread_data, "session"):
        session = CountingSession()
        thread_data.session = session

        with sessions_lock:
            sessions.append(session)

    return thread_data.session


def fetch_one(task, run_id, log_file):
    """Fetch one product using the shared rate limiter."""

    index, barcode, category = task
    session = get_session()

    fields = ",".join(API_FIELDS)
    url = f"{PRODUCT_API_URL}/{barcode}?fields={fields}"

    # These intervals let us measure network-active wall time.
    active_intervals = []

    for attempt in range(1, MAX_ATTEMPTS + 1):

        waited = product_limiter.wait()

        # Record the request-start time, not the log-writing time.
        request_start_utc = datetime.now(
            timezone.utc
        ).isoformat()

        start = time.perf_counter()
        requests_before = session.request_count

        entry = {
            "timestamp_utc": request_start_utc,
            "method": METHOD,
            "run_id": run_id,
            "barcode": barcode,
            "url": url,
            "wait_seconds": round(waited, 3),
        }

        try:
            response = session.get(
                url,
                headers=REQUEST_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )

            end = time.perf_counter()
            active_intervals.append((start, end))

            latency = (end - start) * 1000
            request_count = (
                session.request_count - requests_before
            )

            entry.update(
                url=response.url,
                status_code=response.status_code,
                latency_ms=round(latency, 1),
                success=response.ok,
                error=(
                    f"({request_count} HTTP requests)"
                    if response.ok
                    else f"HTTP {response.status_code} "
                         f"({request_count} HTTP requests)"
                ),
            )

            # Retry only temporary server errors.
            if response.status_code in (429, 503):

                append_request_log(entry, log_file)

                if attempt < MAX_ATTEMPTS:
                    time.sleep(BACKOFF_SECONDS)
                    continue

                return (
                    index,
                    empty_product(barcode, category),
                    None,
                    0,
                    active_intervals,
                    1,
                )

            if not response.ok:

                append_request_log(entry, log_file)

                return (
                    index,
                    empty_product(barcode, category),
                    None,
                    0,
                    active_intervals,
                    1,
                )

            # Convert the API response to JSON.
            try:
                data = response.json()

            except ValueError:
                entry["success"] = False
                entry["error"] = "Invalid JSON response"

                append_request_log(entry, log_file)

                return (
                    index,
                    empty_product(barcode, category),
                    None,
                    0,
                    active_intervals,
                    0,
                )

            row = parse_product(data, barcode, category)

            append_request_log(entry, log_file)

            return (
                index,
                row,
                latency,
                len(response.content),
                active_intervals,
                0,
            )

        except requests.RequestException as error:

            end = time.perf_counter()
            active_intervals.append((start, end))

            entry.update(
                status_code="",
                latency_ms=round((end - start) * 1000, 1),
                success=False,
                error=f"{type(error).__name__}: {error}",
            )

            append_request_log(entry, log_file)

            if attempt < MAX_ATTEMPTS:
                time.sleep(BACKOFF_SECONDS)
                continue

    return (
        index,
        empty_product(barcode, category),
        None,
        0,
        active_intervals,
        1,
    )


def active_wall_time(intervals):
    """Measure network-active time without double-counting overlap."""

    if not intervals:
        return 0.0

    intervals = sorted(intervals)

    first_start, first_end = intervals[0]
    total = 0.0

    for start, end in intervals[1:]:

        if start <= first_end:
            first_end = max(first_end, end)

        else:
            total += first_end - first_start
            first_start, first_end = start, end

    total += first_end - first_start

    return total


def main():
    parser = argparse.ArgumentParser(
        description="Multithreaded Open Food Facts API scraper"
    )

    parser.add_argument("--run-id", default="1")
    parser.add_argument("--limit", type=int)

    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    suffix = "_test" if args.limit is not None else ""

    output_file = (
        PROCESSED_DIR
        / f"api_threaded_products_run{args.run_id}{suffix}.csv"
    )

    log_file = (
        NETWORK_RESULTS_DIR / f"request_log{suffix}.csv"
    )

    metrics_file = (
        NETWORK_RESULTS_DIR / f"metrics_runs{suffix}.csv"
    )

    barcodes = load_benchmark_barcodes(limit=args.limit)

    tasks = [
        (index, barcode, category)
        for index, (barcode, category)
        in enumerate(barcodes)
    ]

    products = [None] * len(tasks)
    latencies = []
    all_intervals = []

    body_bytes = 0
    http_errors = 0

    print(
        f"Threaded API run {args.run_id}: "
        f"{len(tasks)} products, {NUM_WORKERS} workers"
    )

    start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as pool:

        futures = [
            pool.submit(fetch_one, task, args.run_id, log_file)
            for task in tasks
        ]

        for completed, future in enumerate(
            as_completed(futures), 1
        ):
            (
                index,
                row,
                latency,
                received,
                intervals,
                errors,
            ) = future.result()

            products[index] = row
            body_bytes += received
            http_errors += errors
            all_intervals.extend(intervals)

            if latency is not None:
                latencies.append(latency)

            print(
                f"  [{completed}/{len(tasks)}] "
                f"{row['barcode']}: "
                f"{row.get('product_name', '')[:35]!r}"
            )

    # Save products in original barcode order.
    save_start = time.perf_counter()
    save_products(products, output_file)
    save_duration = time.perf_counter() - save_start

    total_time = time.perf_counter() - start

    extracted, field_pct = completeness(products)

    # The sum of thread sleeps would double-count overlapping
    # waiting periods. Instead calculate wall-clock active time.
    active_time = (
        active_wall_time(all_intervals) + save_duration
    )

    wait_time = max(0.0, total_time - active_time)

    summary = {
        "method": METHOD,
        "run_id": args.run_id,
        "products_attempted": len(tasks),
        "products_extracted": extracted,
        "reliability_pct": (
            round(100 * extracted / len(tasks), 2)
            if tasks else 0
        ),
        "field_completeness_pct": field_pct,
        "http_requests": sum(
            session.request_count for session in sessions
        ),
        "http_errors": http_errors,
        "body_bytes_received": body_bytes,
        "total_time_s": round(total_time, 2),
        "wait_time_s": round(wait_time, 2),
        "active_time_s": round(active_time, 2),
        "avg_latency_ms": (
            round(sum(latencies) / len(latencies), 1)
            if latencies else ""
        ),
    }

    save_run_metrics(summary, metrics_file)

    for session in sessions:
        session.close()

    print("\nThreaded API benchmark summary:")
    print(summary)


if __name__ == "__main__":
    main()
