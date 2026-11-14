"""Five-product pilot (plan section 3.2).

Saves evidence in data/raw/pilot/:
    robots.txt
    <barcode>.html                 product page as fetched by requests (what BS4 sees)
    <barcode>.json                 API v2 product response
    <barcode>_selenium.html        page rendered by headless Chrome (--selenium)
    <barcode>_selenium_requests.json   every request Chrome made (--selenium)
    pilot_fetch_log.csv            one row per request

Run from the project root:
    python -m scrapers.pilot              # robots + HTML + JSON
    python -m scrapers.pilot --selenium   # also headless Chrome for 2 products
    python -m scrapers.pilot --selenium-only

Findings are written up in data/raw/pilot/pilot_notes.md.
"""

import json
import sys
import time
from collections import Counter
from urllib.parse import urlparse

import requests

from config import (
    API_FIELDS,
    PRODUCT_API_URL,
    PRODUCT_PAGE_URL,
    BASE_URL,
    RAW_DIR,
    REQUEST_TIMEOUT,
    USER_AGENT,
)
from scrapers.common import append_request_log, product_limiter

PILOT_BARCODES = {
    "7613035449626": "breakfast-cereals",  # Chocapic
    "7622210476241": "biscuits",           # Petit brun extra
    "3045140105502": "chocolates",         # Milka
    "3329770075313": "yogurts",            # Yop fraise
    "3046920028721": "chocolates",         # Lindt 99 %
}
SELENIUM_BARCODES = ["7613035449626", "3329770075313"]

PILOT_DIR = RAW_DIR / "pilot"
LOG_FILE = PILOT_DIR / "pilot_fetch_log.csv"

HTML_HEADERS = {"User-Agent": USER_AGENT, "Accept": "text/html"}
JSON_HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


def fetch(session, url, headers, method, barcode, params=None):
    waited = product_limiter.wait()
    start = time.perf_counter()
    entry = {"method": method, "run_id": "pilot", "barcode": barcode,
             "url": url, "wait_seconds": round(waited, 3)}
    try:
        response = session.get(url, headers=headers, params=params,
                               timeout=REQUEST_TIMEOUT)
        entry.update(url=response.url, status_code=response.status_code,
                     latency_ms=round((time.perf_counter() - start) * 1000, 1),
                     success=response.ok, error="" if response.ok else response.reason)
        append_request_log(entry, LOG_FILE)
        if response.status_code in (429, 503):
            sys.exit(f"HTTP {response.status_code} on {url}: stopping (rate limit)")
        return response
    except requests.RequestException as error:
        entry.update(success=False, error=f"{type(error).__name__}: {error}")
        append_request_log(entry, LOG_FILE)
        raise


def fetch_static():
    session = requests.Session()

    robots = fetch(session, f"{BASE_URL}/robots.txt", HTML_HEADERS, "robots", "")
    (PILOT_DIR / "robots.txt").write_text(robots.text, encoding="utf-8")
    print(f"robots.txt: HTTP {robots.status_code}, {len(robots.text)} chars")

    for barcode in PILOT_BARCODES:
        page = fetch(session, f"{PRODUCT_PAGE_URL}/{barcode}", HTML_HEADERS,
                     "bs4", barcode)
        (PILOT_DIR / f"{barcode}.html").write_text(page.text, encoding="utf-8")
        print(f"{barcode} HTML: HTTP {page.status_code}, {len(page.content)} bytes, "
              f"final URL {page.url}")

        api = fetch(session, f"{PRODUCT_API_URL}/{barcode}", JSON_HEADERS, "api",
                    barcode, params={"fields": ",".join(API_FIELDS)})
        (PILOT_DIR / f"{barcode}.json").write_text(
            json.dumps(api.json(), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{barcode} JSON: HTTP {api.status_code}, {len(api.content)} bytes")


def fetch_selenium():
    from selenium import webdriver

    options = webdriver.ChromeOptions()
    for flag in ("--headless=new", "--no-first-run", "--disable-background-networking",
                 "--disable-component-update", "--disable-sync",
                 "--disable-default-apps", "--no-default-browser-check",
                 f"--user-agent={USER_AGENT}"):
        options.add_argument(flag)
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    for barcode in SELENIUM_BARCODES:
        driver = webdriver.Chrome(options=options)   # fresh temp profile each time
        try:
            waited = product_limiter.wait()
            start = time.perf_counter()
            driver.get(f"{PRODUCT_PAGE_URL}/{barcode}")
            time.sleep(3)                            # let late requests finish
            elapsed = time.perf_counter() - start

            requests_seen = []
            for item in driver.get_log("performance"):
                message = json.loads(item["message"])["message"]
                if message["method"] == "Network.requestWillBeSent":
                    req = message["params"]["request"]
                    requests_seen.append({"url": req["url"], "method": req["method"],
                                          "type": message["params"].get("type", "")})

            hosts = Counter(urlparse(r["url"]).netloc for r in requests_seen
                            if r["url"].startswith("http"))
            (PILOT_DIR / f"{barcode}_selenium_requests.json").write_text(
                json.dumps({"total_requests": len(requests_seen),
                            "requests_per_host": dict(hosts.most_common()),
                            "requests": requests_seen}, indent=1), encoding="utf-8")
            (PILOT_DIR / f"{barcode}_selenium.html").write_text(
                driver.page_source, encoding="utf-8")
            append_request_log({"method": "selenium", "run_id": "pilot",
                                "barcode": barcode, "url": driver.current_url,
                                "latency_ms": round(elapsed * 1000, 1),
                                "wait_seconds": round(waited, 3), "success": True,
                                "error": f"{len(requests_seen)} browser requests"},
                               LOG_FILE)
            print(f"{barcode} Selenium: {len(requests_seen)} requests, "
                  f"per host {dict(hosts.most_common())}")
        finally:
            driver.quit()


if __name__ == "__main__":
    PILOT_DIR.mkdir(parents=True, exist_ok=True)
    if "--selenium-only" not in sys.argv:
        fetch_static()
    if "--selenium" in sys.argv or "--selenium-only" in sys.argv:
        fetch_selenium()
