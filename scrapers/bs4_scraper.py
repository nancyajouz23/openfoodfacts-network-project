"""BeautifulSoup scraper: requests downloads the product page, BS4 parses it.

Never calls the API. Uses the shared 5 s rate limiter, logs every product to
networking/results/request_log.csv and writes one summary row to
networking/results/metrics_runs.csv.

Run from the project root (Linux / WSL for benchmark runs):
    python -m scrapers.bs4_scraper --run-id 1        # benchmark run 1 on the 40
    python -m scrapers.bs4_scraper --limit 3         # quick test, *_test files

Where the values are in the HTML: see data/raw/pilot/pilot_notes.md.
"""

import argparse
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

from config import NETWORK_RESULTS_DIR, PROCESSED_DIR, PRODUCT_PAGE_URL, REQUEST_TIMEOUT, USER_AGENT
from scrapers.common import append_request_log, product_limiter, save_products
from scrapers.metrics import completeness, load_benchmark_barcodes, save_run_metrics

METHOD = "bs4"
HTML_HEADERS = {"User-Agent": USER_AGENT, "Accept": "text/html"}

MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 60          # plan 3.3: on 429/503 wait 60 s, never retry at once

# row label in the nutrition table -> our column
NUTRIENT_ROWS = {
    "Sugars": "sugar_100g",
    "Fat": "fat_100g",
    "Proteins": "protein_100g",
    "Salt": "salt_100g",
}

NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?|\.\d+")
NUTRISCORE_IMG = re.compile(r"nutriscore-([a-e])-new")


# ---------------------------------------------------------------- parsing

def parse_number(text):
    """'1,624 kJ' -> 1624.0, '~ 0.08 g' -> 0.08, '?' -> None."""
    match = NUMBER.search(text.replace("\xa0", " "))
    return float(match.group().replace(",", "")) if match else None


def parse_grams(text):
    """Value of a g/mg cell converted to grams."""
    value = parse_number(text)
    if value is not None and re.search(r"\bmg\b", text):
        value = value / 1000
    return value


def nutrition_table(soup):
    """The 'As sold for 100 g' table (not the per-source table nested below it)."""
    panel = soup.find(id="panel_nutrition_facts_table_content")
    return panel.find("table") if panel else None


def parse_product(html, barcode, category):
    soup = BeautifulSoup(html, "html.parser")
    row = {"barcode": barcode, "category": category, "product_name": "", "brand": "",
           "calories_estimated": False, "nutriscore": ""}

    title = soup.select_one('h1[itemprop="name"]')
    if title:
        # "Chocapic – Nestlé – 645 g": the name is the first part
        row["product_name"] = title.get_text(" ", strip=True).replace("\xa0", " ").split(" – ")[0]

    brand = soup.find(id="field_brands_value")
    if brand:
        row["brand"] = re.sub(r"\s+,", ",", brand.get_text(" ", strip=True))

    table = nutrition_table(soup)
    if table:
        header = [c.get_text(" ", strip=True) for c in table.find("tr").find_all(["th", "td"])]
        if len(header) < 2 or not header[1].startswith("As sold for 100 g"):
            print(f"  {barcode}: unexpected nutrition column {header[1:2]}", file=sys.stderr)
        for tr in table.find_all("tr")[1:]:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            label, value = cells[0], cells[1]
            if label in NUTRIENT_ROWS:
                row[NUTRIENT_ROWS[label]] = parse_grams(value)
            elif label == "Energy":
                kcal = re.search(r"([\d,.]+)\s*kcal", value)
                if kcal:
                    row["calories_100g"] = parse_number(kcal.group(1))
                elif re.search(r"kj", value, re.I) and parse_number(value) is not None:
                    row["calories_100g"] = round(parse_number(value) / 4.184, 1)
                    row["calories_estimated"] = True

    for img in soup.find_all("img", src=True):
        grade = NUTRISCORE_IMG.search(img["src"])
        if grade:
            row["nutriscore"] = grade.group(1).upper()
            break

    return row


# ---------------------------------------------------------------- network

class CountingSession(requests.Session):
    """Counts every HTTP response, redirects included (plan 4.1)."""

    def __init__(self):
        super().__init__()
        self.request_count = 0
        self.hooks["response"].append(self._count)

    def _count(self, response, *args, **kwargs):
        self.request_count += 1


def fetch(session, url, barcode, run_id):
    """GET a product page with the rate limiter; returns (response|None, wait, latency)."""
    total_wait = 0.0
    for attempt in range(1, MAX_ATTEMPTS + 1):
        total_wait += product_limiter.wait()
        before = session.request_count
        start = time.perf_counter()
        entry = {"method": METHOD, "run_id": run_id, "barcode": barcode, "url": url}
        try:
            response = session.get(url, headers=HTML_HEADERS, timeout=REQUEST_TIMEOUT)
            latency = (time.perf_counter() - start) * 1000
            entry.update(url=response.url, status_code=response.status_code,
                         latency_ms=round(latency, 1), wait_seconds=round(total_wait, 3),
                         success=response.ok,
                         error="" if response.ok else f"HTTP {response.status_code}")
            # the request count goes in the error column, since the log has no own column
            entry["error"] = (entry["error"]
                              + f" ({session.request_count - before} HTTP requests)").strip()
            append_request_log(entry, LOG_FILE)

            if response.status_code in (429, 503):
                print(f"  {barcode}: HTTP {response.status_code}, waiting {BACKOFF_SECONDS} s")
                time.sleep(BACKOFF_SECONDS)
                total_wait += BACKOFF_SECONDS
                continue
            return response, total_wait, latency

        except requests.RequestException as error:
            latency = (time.perf_counter() - start) * 1000
            entry.update(latency_ms=round(latency, 1), wait_seconds=round(total_wait, 3),
                         success=False, error=f"{type(error).__name__}: {error}")
            append_request_log(entry, LOG_FILE)
            print(f"  {barcode}: {type(error).__name__}, waiting {BACKOFF_SECONDS} s")
            time.sleep(BACKOFF_SECONDS)
            total_wait += BACKOFF_SECONDS

    return None, total_wait, None


# ---------------------------------------------------------------- main

def main():
    global LOG_FILE
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run-id", default="1", help="benchmark run number (1, 2, 3)")
    parser.add_argument("--limit", type=int, help="only the first N barcodes (test mode)")
    args = parser.parse_args()

    suffix = "_test" if args.limit else ""
    output_file = PROCESSED_DIR / f"bs4_products_run{args.run_id}{suffix}.csv"
    LOG_FILE = NETWORK_RESULTS_DIR / f"request_log{suffix}.csv"
    metrics_file = NETWORK_RESULTS_DIR / f"metrics_runs{suffix}.csv"

    barcodes = load_benchmark_barcodes(limit=args.limit)
    session = CountingSession()
    products, latencies = [], []
    wait_time = 0.0
    body_bytes = 0
    http_errors = 0

    print(f"BS4 run {args.run_id}: {len(barcodes)} products")
    start = time.perf_counter()

    for number, (barcode, category) in enumerate(barcodes, 1):
        response, waited, latency = fetch(session, f"{PRODUCT_PAGE_URL}/{barcode}",
                                          barcode, args.run_id)
        wait_time += waited
        if response is None or not response.ok:
            http_errors += 1
            products.append({"barcode": barcode, "category": category})
            print(f"  [{number}/{len(barcodes)}] {barcode}: FAILED")
            continue

        latencies.append(latency)
        body_bytes += len(response.content)
        row = parse_product(response.text, barcode, category)
        products.append(row)
        missing = [k for k in ("sugar_100g", "fat_100g", "protein_100g", "salt_100g",
                               "calories_100g", "nutriscore") if row.get(k) in (None, "")]
        print(f"  [{number}/{len(barcodes)}] {barcode}: {row['product_name'][:35]!r} "
              f"{latency:.0f} ms" + (f", missing {missing}" if missing else ""))

    save_products(products, output_file)
    total_time = time.perf_counter() - start

    extracted, field_pct = completeness(products)
    summary = {
        "method": METHOD,
        "run_id": args.run_id,
        "products_attempted": len(barcodes),
        "products_extracted": extracted,
        "reliability_pct": round(100 * extracted / len(barcodes), 2) if barcodes else 0,
        "field_completeness_pct": field_pct,
        "http_requests": session.request_count,
        "http_errors": http_errors,
        "body_bytes_received": body_bytes,
        "total_time_s": round(total_time, 2),
        "wait_time_s": round(wait_time, 2),
        "active_time_s": round(total_time - wait_time, 2),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else "",
    }
    save_run_metrics(summary, metrics_file)
    print("Summary:", summary)


LOG_FILE = NETWORK_RESULTS_DIR / "request_log.csv"

if __name__ == "__main__":
    main()
