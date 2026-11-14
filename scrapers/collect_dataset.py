"""Collect the 200-product ML dataset and draw the fixed 40 benchmark barcodes.

Follows section 2 of the team plan:
  * paged API v2 searches per category (no single product calls),
  * filters: one country (config COUNTRY_TAG) + nutrition facts completed,
  * one category per product (barcodes found in several category searches
    are dropped from all of them),
  * cleaning rules, with the number of rows each rule excludes,
  * 10 random barcodes per category (random_state=RANDOM_SEED) -> the 40.

Run from the project root:
    python -m scrapers.collect_dataset

Outputs:
    data/processed/ml_products.csv          the cleaned ~200 products
    data/barcodes_benchmark.csv             the fixed 40 (subset of the 200)
    data/processed/collection_report.json   counts per rule, pages fetched
    data/raw/searches/                      raw JSON of every search page + log
"""

import json
import math
import time
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd
import requests

from config import (
    API_FIELDS,
    BENCHMARK_DATASET_SIZE,
    CATEGORIES,
    COUNTRY_TAG,
    DATA_DIR,
    PROCESSED_DIR,
    RANDOM_SEED,
    RAW_DIR,
    REQUEST_HEADERS,
    SEARCH_API_URL,
)
from scrapers.common import append_request_log, save_products, search_limiter

PAGE_SIZE = 50
SEARCH_TIMEOUT = 60          # search is slower than product reads
MAX_PAGES_PER_CATEGORY = 10
MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 60         # plan 3.3: on 429/503 back off 60 s, never retry at once

NUTRITION_STATE = "en:nutrition-facts-completed"

SEARCH_RAW_DIR = RAW_DIR / "searches"
SEARCH_LOG = SEARCH_RAW_DIR / "search_log.csv"
ML_FILE = PROCESSED_DIR / "ml_products.csv"
BENCHMARK_FILE = DATA_DIR / "barcodes_benchmark.csv"
REPORT_FILE = PROCESSED_DIR / "collection_report.json"

# our column -> Open Food Facts nutriments key (plan 2.2)
NUTRIENT_FIELDS = {
    "sugar_100g": "sugars_100g",
    "fat_100g": "fat_100g",
    "protein_100g": "proteins_100g",
    "salt_100g": "salt_100g",
}
FEATURES = list(NUTRIENT_FIELDS) + ["calories_100g"]
NUTRISCORE_GRADES = {"A", "B", "C", "D", "E"}


# ---------------------------------------------------------------- mapping

def to_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(number) else number


def map_product(product, category):
    """Turn one API product into a row of the standard CSV schema."""
    nutriments = product.get("nutriments") or {}

    row = {
        "barcode": str(product.get("code") or "").strip(),
        "product_name": (product.get("product_name") or "").strip(),
        "brand": (product.get("brands") or "").strip(),
        "category": category,
    }
    for column, key in NUTRIENT_FIELDS.items():
        row[column] = to_float(nutriments.get(key))

    calories = to_float(nutriments.get("energy-kcal_100g"))
    estimated = False
    if calories is None:
        kilojoules = to_float(nutriments.get("energy-kj_100g"))
        if kilojoules is not None:
            calories = round(kilojoules / 4.184, 1)
            estimated = True
    row["calories_100g"] = calories
    row["calories_estimated"] = estimated

    grade = (product.get("nutriscore_grade") or "").strip().upper()
    row["nutriscore"] = grade if grade in NUTRISCORE_GRADES else ""
    return row


def exclusion_reason(row):
    """Return why a row fails the cleaning rules, or None if it is valid."""
    if not row["barcode"]:
        return "missing_barcode"
    if any(row[feature] is None for feature in FEATURES):
        return "missing_nutrient"
    if any(row[c] < 0 or row[c] > 100 for c in NUTRIENT_FIELDS):
        return "impossible_nutrient_over_100g"
    if row["calories_100g"] < 0 or row["calories_100g"] > 900:
        return "impossible_calories_over_900kcal"
    return None


# ---------------------------------------------------------------- network

def fetch_page(session, tag, page):
    params = {
        "categories_tags_en": tag,
        "countries_tags": COUNTRY_TAG,
        "states_tags": NUTRITION_STATE,
        "page_size": PAGE_SIZE,
        "page": page,
        "fields": ",".join(API_FIELDS),
    }

    for attempt in range(1, MAX_ATTEMPTS + 1):
        waited = search_limiter.wait()
        start = time.perf_counter()
        entry = {
            "method": "api_search",
            "run_id": "collect",
            "barcode": f"{tag}#page{page}",
            "url": SEARCH_API_URL,
            "wait_seconds": round(waited, 3),
        }
        try:
            response = session.get(
                SEARCH_API_URL, params=params, timeout=SEARCH_TIMEOUT
            )
            entry["url"] = response.url
            entry["status_code"] = response.status_code
            entry["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)

            if response.status_code in (429, 503):
                entry.update(success=False, error=f"HTTP {response.status_code}, backing off")
                append_request_log(entry, SEARCH_LOG)
                print(f"  {tag} page {page}: HTTP {response.status_code}, "
                      f"waiting {BACKOFF_SECONDS} s (attempt {attempt})")
                time.sleep(BACKOFF_SECONDS)
                continue

            response.raise_for_status()
            data = response.json()
            entry.update(success=True, error="")
            append_request_log(entry, SEARCH_LOG)

            raw_file = SEARCH_RAW_DIR / f"{tag}_page{page}.json"
            raw_file.write_text(
                json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            return data

        except (requests.RequestException, ValueError) as error:
            entry.setdefault("latency_ms", round((time.perf_counter() - start) * 1000, 1))
            entry.update(success=False, error=f"{type(error).__name__}: {error}")
            append_request_log(entry, SEARCH_LOG)
            print(f"  {tag} page {page}: {type(error).__name__}, "
                  f"waiting {BACKOFF_SECONDS} s (attempt {attempt})")
            time.sleep(BACKOFF_SECONDS)

    raise RuntimeError(f"Search failed {MAX_ATTEMPTS} times: {tag} page {page}")


# ---------------------------------------------------------------- selection

def select(fetched):
    """Apply duplicate and cleaning rules in order; return kept rows + counts.

    fetched: {category: [rows in search order]}
    """
    categories_of = defaultdict(set)
    for category, rows in fetched.items():
        for row in rows:
            if row["barcode"]:
                categories_of[row["barcode"]].add(category)

    counts = defaultdict(int)
    valid = {}
    for category, rows in fetched.items():
        seen = set()
        valid[category] = []
        for row in rows:
            counts["fetched"] += 1
            barcode = row["barcode"]
            if barcode and barcode in seen:
                counts["duplicate_barcode_same_category"] += 1
                continue
            seen.add(barcode)
            if barcode and len(categories_of[barcode]) > 1:
                counts["in_several_categories"] += 1
                continue
            reason = exclusion_reason(row)
            if reason:
                counts[reason] += 1
                continue
            valid[category].append(row)
    return valid, counts


# ---------------------------------------------------------------- main

def main():
    SEARCH_RAW_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    fetched = {tag: [] for tag in CATEGORIES}
    pages_fetched = {tag: 0 for tag in CATEGORIES}
    available = {}
    exhausted = set()

    print(f"Collecting {sum(CATEGORIES.values())} products "
          f"(country {COUNTRY_TAG}, {NUTRITION_STATE})")

    while True:
        valid, _ = select(fetched)
        needed = [
            tag for tag, target in CATEGORIES.items()
            if len(valid[tag]) < target and tag not in exhausted
        ]
        if not needed:
            break

        for tag in needed:
            page = pages_fetched[tag] + 1
            data = fetch_page(session, tag, page)
            pages_fetched[tag] = page
            products = data.get("products") or []
            available[tag] = data.get("count")
            fetched[tag].extend(map_product(p, tag) for p in products)
            print(f"  {tag} page {page}: {len(products)} products "
                  f"({available[tag]} matching in total)")

            last_page = page * PAGE_SIZE >= int(data.get("count") or 0)
            if not products or last_page or page >= MAX_PAGES_PER_CATEGORY:
                exhausted.add(tag)

    valid, counts = select(fetched)

    ml_rows, unused = [], {}
    for tag, target in CATEGORIES.items():
        ml_rows.extend(valid[tag][:target])
        unused[tag] = max(0, len(valid[tag]) - target)
        if len(valid[tag]) < target:
            print(f"WARNING: {tag} has only {len(valid[tag])} valid products "
                  f"(target {target})")

    save_products(ml_rows, ML_FILE)

    # The fixed 40: same number per category, random_state = seed
    per_category = BENCHMARK_DATASET_SIZE // len(CATEGORIES)
    ml_df = pd.DataFrame(ml_rows)
    benchmark = (
        ml_df.groupby("category", sort=False)
        .sample(n=per_category, random_state=RANDOM_SEED)
        [["barcode", "category", "product_name"]]
    )
    benchmark.to_csv(BENCHMARK_FILE, index=False, encoding="utf-8")
    print(f"Saved {len(benchmark)} benchmark barcodes to {BENCHMARK_FILE}")

    report = {
        "collected_at_utc": datetime.now(timezone.utc).isoformat(),
        "api": SEARCH_API_URL,
        "filters": {
            "countries_tags": COUNTRY_TAG,
            "states_tags": NUTRITION_STATE,
            "page_size": PAGE_SIZE,
        },
        "pages_fetched": pages_fetched,
        "searches_total": sum(pages_fetched.values()),
        "matching_products_in_database": available,
        "rows_excluded_by_rule": {k: v for k, v in counts.items() if k != "fetched"},
        "rows_fetched": counts["fetched"],
        "valid_but_unused_beyond_target": unused,
        "ml_products_per_category": ml_df["category"].value_counts().to_dict(),
        "ml_products_total": len(ml_rows),
        "calories_estimated_from_kj": int(ml_df["calories_estimated"].sum()),
        "benchmark_per_category": per_category,
        "benchmark_total": len(benchmark),
        "random_seed": RANDOM_SEED,
    }
    REPORT_FILE.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
