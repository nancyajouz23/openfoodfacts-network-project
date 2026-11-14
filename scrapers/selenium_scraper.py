"""Selenium scraper: headless Chrome opens each product page and reads the rendered DOM.

Plan 3.1 / 4.2:
  * headless Chrome, fresh temporary profile for every run (cold cache),
  * background networking disabled,
  * shared 5 s rate limiter before every page load,
  * every HTTP request Chrome makes is counted from the performance log
    (goog:loggingPrefs), with a per-host breakdown saved per run.

Run from the project root (Linux / WSL for benchmark runs):
    python -m scrapers.selenium_scraper --run-id 1          # benchmark run on the 40
    python -m scrapers.selenium_scraper --limit 3           # quick test, *_test files
    python -m scrapers.selenium_scraper --block-analytics   # block Matomo pings

Where the values are in the page: see data/raw/pilot/pilot_notes.md.
"""

import argparse
import json
import os
import re
import shutil
import tempfile
import time
from collections import Counter
from urllib.parse import urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

from config import NETWORK_RESULTS_DIR, PROCESSED_DIR, PRODUCT_PAGE_URL, REQUEST_TIMEOUT, USER_AGENT
from scrapers.bs4_scraper import NUTRIENT_ROWS, NUTRISCORE_IMG, parse_grams, parse_number
from scrapers.common import append_request_log, product_limiter, save_products
from scrapers.metrics import completeness, load_benchmark_barcodes, save_run_metrics

METHOD = "selenium"
MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 60          # plan 3.3: on 429/503 wait 60 s, never retry at once
ANALYTICS_PATTERN = "*analytics.openfoodfacts.org*"

# Chrome's own background features (not needed to show a product page)
CHROME_FEATURES_OFF = [
    "OptimizationGuideModelDownloading", "OptimizationHintsFetching",
    "OptimizationTargetPrediction", "OptimizationHints",
    "AutofillServerCommunication", "MediaRouter", "Translate",
]
CHROME_HOSTS_OFF = [
    "optimizationguide-pa.googleapis.com",
    "content-autofill.googleapis.com",
    "clients2.google.com",
    "update.googleapis.com",
    "accounts.google.com",
]

# One round trip: all rows of the "As sold for 100 g" table as lists of cell texts
TABLE_ROWS_JS = """
const panel = document.getElementById('panel_nutrition_facts_table_content');
const table = panel ? panel.querySelector('table') : null;
if (!table) return null;
return Array.from(table.querySelectorAll('tr')).map(
    tr => Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent));
"""


def clean(text):
    """Collapse whitespace (textContent keeps the HTML indentation)."""
    return " ".join((text or "").replace("\xa0", " ").split())


# ---------------------------------------------------------------- browser

def make_driver(profile_dir, block_analytics):
    options = webdriver.ChromeOptions()
    for flag in (
        "--headless=new",
        f"--user-data-dir={profile_dir}",        # fresh profile -> cold cache
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-client-side-phishing-detection",
        "--disable-domain-reliability",
        "--no-pings",
        f"--disable-features={','.join(CHROME_FEATURES_OFF)}",
        # Hosts Chrome contacts for itself (found in the first benchmark pcaps):
        # they fail at DNS level inside Chrome, so no packet is sent.
        "--host-resolver-rules=" + ", ".join(f"MAP {h} ~NOTFOUND" for h in CHROME_HOSTS_OFF),
        f"--user-agent={USER_AGENT}",
    ):
        options.add_argument(flag)
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    # chromedriver path resolved by run_benchmark.sh BEFORE the capture starts, so
    # Selenium Manager's version lookup (googlechromelabs.github.io) is not measured.
    driver_path = os.environ.get("OFF_CHROMEDRIVER")
    service = Service(executable_path=driver_path) if driver_path else Service()

    driver = webdriver.Chrome(options=options, service=service)
    driver.set_page_load_timeout(REQUEST_TIMEOUT)
    if block_analytics:
        driver.execute_cdp_cmd("Network.enable", {})
        driver.execute_cdp_cmd("Network.setBlockedURLs", {"urls": [ANALYTICS_PATTERN]})
    return driver


class NetworkCounter:
    """Reads Chrome's performance log: requests, per-host counts, bytes, document status."""

    def __init__(self):
        self.browser_requests = 0      # everything the page asked for
        self.from_cache = 0            # answered by Chrome's cache, never sent
        self.bytes = 0
        self.hosts = Counter()         # network requests per host
        self._host_of = {}

    @property
    def requests(self):
        """HTTP requests that actually went over the network."""
        return self.browser_requests - self.from_cache

    def drain(self, driver):
        """Process new log entries; return (network requests, last document status)."""
        before, doc_status = self.requests, None
        for item in driver.get_log("performance"):
            message = json.loads(item["message"])["message"]
            method, params = message["method"], message["params"]
            if method == "Network.requestWillBeSent":   # one per request, redirects included
                url = params["request"]["url"]
                if url.startswith("http"):
                    self.browser_requests += 1
                    host = urlparse(url).netloc
                    self._host_of[params["requestId"]] = host
                    self.hosts[host] += 1
            elif method == "Network.requestServedFromCache":
                self.from_cache += 1
                host = self._host_of.get(params["requestId"])
                if host:
                    self.hosts[host] -= 1
            elif method == "Network.loadingFinished":
                self.bytes += int(params.get("encodedDataLength", 0))
            elif method == "Network.responseReceived" and params.get("type") == "Document":
                doc_status = params["response"]["status"]
        return self.requests - before, doc_status


# ---------------------------------------------------------------- extraction

def extract_product(driver, barcode, category):
    row = {"barcode": barcode, "category": category, "product_name": "", "brand": "",
           "calories_estimated": False, "nutriscore": ""}

    titles = driver.find_elements(By.CSS_SELECTOR, 'h1[itemprop="name"]')
    if titles:
        # "Chocapic – Nestlé – 645 g": the name is the first part
        row["product_name"] = clean(titles[0].get_attribute("textContent")).split(" – ")[0]

    brands = driver.find_elements(By.ID, "field_brands_value")
    if brands:
        row["brand"] = re.sub(r"\s+,", ",", clean(brands[0].get_attribute("textContent")))

    table = driver.execute_script(TABLE_ROWS_JS) or []
    for cells in table[1:]:
        cells = [clean(c) for c in cells]
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

    for img in driver.find_elements(By.CSS_SELECTOR, 'img[src*="nutriscore-"]'):
        grade = NUTRISCORE_IMG.search(img.get_attribute("src") or "")
        if grade:
            row["nutriscore"] = grade.group(1).upper()
            break

    return row


# ---------------------------------------------------------------- page load

def load_page(driver, counter, url, barcode, run_id, log_file):
    """Open a product page with the rate limiter; returns (ok, wait, latency_ms)."""
    total_wait = 0.0
    for attempt in range(1, MAX_ATTEMPTS + 1):
        total_wait += product_limiter.wait()
        counter.drain(driver)            # late requests of the previous page are not ours
        start = time.perf_counter()
        entry = {"method": METHOD, "run_id": run_id, "barcode": barcode, "url": url}
        try:
            driver.get(url)              # returns after the page "load" event
            latency = (time.perf_counter() - start) * 1000
            requests_made, status = counter.drain(driver)
            ok = status is not None and status < 400
            entry.update(url=driver.current_url, status_code=status or "",
                         latency_ms=round(latency, 1), wait_seconds=round(total_wait, 3),
                         success=ok,
                         error=(("" if ok else
                                 f"HTTP {status}" if status else "no HTTP response (Chrome error page)")
                                + f" ({requests_made} HTTP requests)").strip())
            append_request_log(entry, log_file)

            if status in (429, 503):
                print(f"  {barcode}: HTTP {status}, waiting {BACKOFF_SECONDS} s")
                time.sleep(BACKOFF_SECONDS)
                total_wait += BACKOFF_SECONDS
                continue
            return ok, total_wait, latency

        except (TimeoutException, WebDriverException) as error:
            latency = (time.perf_counter() - start) * 1000
            counter.drain(driver)
            entry.update(latency_ms=round(latency, 1), wait_seconds=round(total_wait, 3),
                         success=False, error=f"{type(error).__name__}: {clean(error.msg)[:150]}")
            append_request_log(entry, log_file)
            print(f"  {barcode}: {type(error).__name__}, waiting {BACKOFF_SECONDS} s")
            time.sleep(BACKOFF_SECONDS)
            total_wait += BACKOFF_SECONDS

    return False, total_wait, None


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run-id", default="1", help="benchmark run number (1, 2, 3)")
    parser.add_argument("--limit", type=int, help="only the first N barcodes (test mode)")
    parser.add_argument("--block-analytics", action="store_true",
                        help="block analytics.openfoodfacts.org (Matomo) requests")
    parser.add_argument("--print-driver-path", action="store_true",
                        help="only print the chromedriver path (used by run_benchmark.sh)")
    args = parser.parse_args()

    if args.print_driver_path:
        from selenium.webdriver.common.selenium_manager import SeleniumManager
        print(SeleniumManager().binary_paths(["--browser", "chrome"])["driver_path"])
        return

    suffix = "_test" if args.limit else ""
    output_file = PROCESSED_DIR / f"selenium_products_run{args.run_id}{suffix}.csv"
    log_file = NETWORK_RESULTS_DIR / f"request_log{suffix}.csv"
    metrics_file = NETWORK_RESULTS_DIR / f"metrics_runs{suffix}.csv"
    hosts_file = NETWORK_RESULTS_DIR / f"selenium_hosts_run{args.run_id}{suffix}.json"

    barcodes = load_benchmark_barcodes(limit=args.limit)
    products, latencies = [], []
    wait_time = 0.0
    http_errors = 0
    counter = NetworkCounter()

    print(f"Selenium run {args.run_id}: {len(barcodes)} products"
          + (" (analytics blocked)" if args.block_analytics else ""))

    profile_dir = tempfile.mkdtemp(prefix="off_selenium_")
    start = time.perf_counter()          # browser start-up is part of Selenium's cost
    driver = make_driver(profile_dir, args.block_analytics)
    try:
        for number, (barcode, category) in enumerate(barcodes, 1):
            ok, waited, latency = load_page(driver, counter, f"{PRODUCT_PAGE_URL}/{barcode}",
                                            barcode, args.run_id, log_file)
            wait_time += waited
            if not ok:
                http_errors += 1
                products.append({"barcode": barcode, "category": category})
                print(f"  [{number}/{len(barcodes)}] {barcode}: FAILED")
                continue

            latencies.append(latency)
            row = extract_product(driver, barcode, category)
            products.append(row)
            missing = [k for k in ("sugar_100g", "fat_100g", "protein_100g", "salt_100g",
                                   "calories_100g", "nutriscore") if row.get(k) in (None, "")]
            print(f"  [{number}/{len(barcodes)}] {barcode}: {row['product_name'][:35]!r} "
                  f"{latency:.0f} ms" + (f", missing {missing}" if missing else ""))

        counter.drain(driver)
    finally:
        driver.quit()
        shutil.rmtree(profile_dir, ignore_errors=True)

    save_products(products, output_file)
    total_time = time.perf_counter() - start

    extracted, field_pct = completeness(products)
    summary = {
        "method": METHOD + ("_noanalytics" if args.block_analytics else ""),
        "run_id": args.run_id,
        "products_attempted": len(barcodes),
        "products_extracted": extracted,
        "reliability_pct": round(100 * extracted / len(barcodes), 2) if barcodes else 0,
        "field_completeness_pct": field_pct,
        "http_requests": counter.requests,
        "http_errors": http_errors,
        "body_bytes_received": counter.bytes,   # Chrome encodedDataLength (wire bytes)
        "total_time_s": round(total_time, 2),
        "wait_time_s": round(wait_time, 2),
        "active_time_s": round(total_time - wait_time, 2),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else "",
    }
    save_run_metrics(summary, metrics_file)
    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    hosts_file.write_text(json.dumps({"network_requests": counter.requests,
                                      "browser_requests": counter.browser_requests,
                                      "served_from_cache": counter.from_cache,
                                      "network_requests_per_host": dict(counter.hosts.most_common())},
                                     indent=1), encoding="utf-8")
    print(f"Browser asked for {counter.browser_requests} resources, "
          f"{counter.from_cache} came from cache")
    print("Network requests per host:", dict(counter.hosts.most_common()))
    print("Summary:", summary)


if __name__ == "__main__":
    main()
