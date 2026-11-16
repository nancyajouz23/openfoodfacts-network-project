
"""
Open Food Facts API scraper: retrieves product data through API v2.

Uses one GET request per product under normal conditions.
Uses the shared 5-second rate limiter and benchmark metrics helpers.

Run from the project root:
    python -m scrapers.api_scraper --run-id 1
    python -m scrapers.api_scraper --limit 3
"""

import argparse
import math
import time

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


METHOD = "api"

MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 60


# ------------------------------------------------------------
# 1. Count HTTP requests
# ------------------------------------------------------------

class CountingSession(requests.Session):

    def __init__(self):
        super().__init__()
        self.request_count = 0
        self.hooks["response"].append(self._count)

    def _count(self, response, *args, **kwargs):
        self.request_count += 1


# ------------------------------------------------------------
# 2. Extract product information from JSON
# ------------------------------------------------------------

def to_number(value):
    """Convert a JSON value to float, or return None."""

    if value is None or value == "":
        return None

    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def empty_product(barcode, category):
    """Return an empty product row after a failed extraction."""

    return {
        "barcode": barcode,
        "category": category,
        "product_name": "",
        "brand": "",
        "calories_estimated": False,
        "nutriscore": "",
    }


def parse_product(data, barcode, category):
    """Extract the required fields from an OFF API JSON response."""

    if not isinstance(data, dict) or str(data.get("status")) != "1":
        return empty_product(barcode, category)

    product = data.get("product")

    if not isinstance(product, dict):
        return empty_product(barcode, category)

    nutriments = product.get("nutriments") or {}

    if not isinstance(nutriments, dict):
        nutriments = {}

    row = empty_product(barcode, category)

    row["product_name"] = product.get("product_name") or ""

    brands = product.get("brands") or ""

    if isinstance(brands, list):
        brands = ", ".join(str(brand) for brand in brands)

    row["brand"] = brands

    row["sugar_100g"] = to_number(
        nutriments.get("sugars_100g")
    )

    row["fat_100g"] = to_number(
        nutriments.get("fat_100g")
    )

    row["protein_100g"] = to_number(
        nutriments.get("proteins_100g")
    )

    row["salt_100g"] = to_number(
        nutriments.get("salt_100g")
    )

    # Prefer kcal directly provided by the API.
    calories = to_number(
        nutriments.get("energy-kcal_100g")
    )

    # If kcal is unavailable, convert kJ to kcal.
    if calories is None:
        energy_kj = to_number(
            nutriments.get("energy-kj_100g")
        )

        if energy_kj is not None:
            calories = round(energy_kj / 4.184, 1)
            row["calories_estimated"] = True

    row["calories_100g"] = calories

    grade = (
        product.get("nutriscore_grade")
        or product.get("nutrition_grade_fr")
        or ""
    )

    row["nutriscore"] = str(grade).strip().upper()

    return row


# ------------------------------------------------------------
# 3. Send API requests
# ------------------------------------------------------------

def fetch_product(session, url, barcode, run_id, log_file):
    """Fetch one product with rate limiting and retry handling."""

    total_wait = 0.0

    for attempt in range(1, MAX_ATTEMPTS + 1):

        total_wait += product_limiter.wait()

        before = session.request_count
        start = time.perf_counter()

        entry = {
            "method": METHOD,
            "run_id": run_id,
            "barcode": barcode,
            "url": url,
        }

        try:
            response = session.get(
                url,
                headers=REQUEST_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )

            latency = (time.perf_counter() - start) * 1000

            request_delta = session.request_count - before

            entry.update(
                url=response.url,
                status_code=response.status_code,
                latency_ms=round(latency, 1),
                wait_seconds=round(total_wait, 3),
                success=response.ok,
                error="" if response.ok else f"HTTP {response.status_code}",
            )

            entry["error"] = (
                entry["error"]
                + f" ({request_delta} HTTP requests)"
            ).strip()

            append_request_log(entry, log_file)

            # Respect server rate limiting.
            if response.status_code in (429, 503):

                if attempt == MAX_ATTEMPTS:
                    return response, total_wait, latency

                print(
                    f"  {barcode}: HTTP {response.status_code}, "
                    f"waiting {BACKOFF_SECONDS} seconds"
                )

                time.sleep(BACKOFF_SECONDS)
                total_wait += BACKOFF_SECONDS
                continue

            return response, total_wait, latency

        except requests.RequestException as error:

            latency = (time.perf_counter() - start) * 1000

            request_delta = session.request_count - before

            entry.update(
                latency_ms=round(latency, 1),
                wait_seconds=round(total_wait, 3),
                success=False,
                error=(
                    f"{type(error).__name__}: {error} "
                    f"({request_delta} HTTP requests)"
                ),
            )

            append_request_log(entry, log_file)

            if attempt == MAX_ATTEMPTS:
                print(f"  {barcode}: giving up after {attempt} attempts")
                break

            print(
                f"  {barcode}: {type(error).__name__}, "
                f"waiting {BACKOFF_SECONDS} seconds"
            )

            time.sleep(BACKOFF_SECONDS)
            total_wait += BACKOFF_SECONDS

    return None, total_wait, None


# ------------------------------------------------------------
# 4. Main benchmark execution
# ------------------------------------------------------------

def main():

    parser = argparse.ArgumentParser(
        description="Open Food Facts API scraper"
    )

    parser.add_argument(
        "--run-id",
        default="1",
        help="Benchmark run number",
    )

    parser.add_argument(
        "--limit",
        type=int,
        help="Only process the first N barcodes (test mode)",
    )

    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    suffix = "_test" if args.limit is not None else ""

    output_file = (
        PROCESSED_DIR
        / f"api_products_run{args.run_id}{suffix}.csv"
    )

    log_file = (
        NETWORK_RESULTS_DIR
        / f"request_log{suffix}.csv"
    )

    metrics_file = (
        NETWORK_RESULTS_DIR
        / f"metrics_runs{suffix}.csv"
    )

    # Load benchmark barcodes.
    barcodes = load_benchmark_barcodes(limit=args.limit)

    # Request exactly the fields configured in config.py.
    fields = ",".join(API_FIELDS)

    session = CountingSession()

    products = []
    latencies = []

    wait_time = 0.0
    body_bytes = 0
    http_errors = 0

    print(f"API run {args.run_id}: {len(barcodes)} products")

    start = time.perf_counter()

    for number, (barcode, category) in enumerate(barcodes, 1):

        url = f"{PRODUCT_API_URL}/{barcode}?fields={fields}"

        response, waited, latency = fetch_product(
            session,
            url,
            barcode,
            args.run_id,
            log_file,
        )

        wait_time += waited

        if response is None or not response.ok:

            http_errors += 1

            products.append(
                empty_product(barcode, category)
            )

            print(
                f"  [{number}/{len(barcodes)}] "
                f"{barcode}: FAILED"
            )

            continue

        latencies.append(latency)

        body_bytes += len(response.content)

        try:
            data = response.json()

        except ValueError:

            print(f"  {barcode}: Invalid JSON response")

            products.append(
                empty_product(barcode, category)
            )

            continue

        row = parse_product(data, barcode, category)

        products.append(row)

        missing = [
            field
            for field in (
                "sugar_100g",
                "fat_100g",
                "protein_100g",
                "salt_100g",
                "calories_100g",
                "nutriscore",
            )
            if row.get(field) in (None, "")
        ]

        print(
            f"  [{number}/{len(barcodes)}] "
            f"{barcode}: {row['product_name'][:35]!r} "
            f"{latency:.0f} ms"
            + (f", missing {missing}" if missing else "")
        )

    # Save extracted products.
    save_products(products, output_file)

    total_time = time.perf_counter() - start

    # Calculate extraction completeness.
    extracted, field_pct = completeness(products)

    summary = {
        "method": METHOD,
        "run_id": args.run_id,
        "products_attempted": len(barcodes),
        "products_extracted": extracted,
        "reliability_pct": (
            round(100 * extracted / len(barcodes), 2)
            if barcodes else 0
        ),
        "field_completeness_pct": field_pct,
        "http_requests": session.request_count,
        "http_errors": http_errors,
        "body_bytes_received": body_bytes,
        "total_time_s": round(total_time, 2),
        "wait_time_s": round(wait_time, 2),
        "active_time_s": round(total_time - wait_time, 2),
        "avg_latency_ms": (
            round(sum(latencies) / len(latencies), 1)
            if latencies else ""
        ),
    }

    save_run_metrics(summary, metrics_file)

    session.close()

    print("\nAPI benchmark summary:")
    print(summary)


if __name__ == "__main__":
    main()
