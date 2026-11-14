# Open Food Facts — Network Programming Project

## Objective
Compare Selenium, BeautifulSoup, and API-based scraping (plus a multithreaded
API variant) on the same 40 Open Food Facts products, measuring network
behaviour, and cluster ~200 products by nutrition with K-Means.

**Research question:** Which method is the most efficient and reliable for
collecting nutritional data from Open Food Facts, considering speed, bandwidth,
request count, latency and completeness?

## Performance Metrics
- Total and active elapsed time (s)
- Bandwidth — OFF only and total (KB)
- HTTP request count
- Average latency (ms)
- Reliability (%)
- Field completeness (%)

## Dataset
- 200 food products for machine learning (`data/processed/ml_products.csv`)
- 40 fixed products for scraper benchmarking (`data/barcodes_benchmark.csv`, seed 42)
- Categories: breakfast cereals, biscuits, chocolates, yogurts

## Setup
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env    # then set OFF_CONTACT_EMAIL (used in the User-Agent)
```
Selenium needs Google Chrome installed; Selenium Manager downloads the matching driver.

## How to run
Run scrapers as modules **from the project root** (so `config.py` is importable):
```bash
python -m scrapers.api_scraper
python -m scrapers.api_threaded
python -m scrapers.bs4_scraper
python -m scrapers.selenium_scraper
```
Benchmarks (Linux, needs sudo for tcpdump): `bash networking/run_benchmark.sh`.
Only **one** benchmark runs at a time across the team (shared OFF rate limit).

## Responsible scraping
- Identified User-Agent: `OFFNetworkLab/1.0 (<team email>)`
- ≥ 5 s between product requests, ≥ 6–7 s between searches
- Back off 60 s on HTTP 429/503; no proxies/Tor to evade limits

## Repository structure
```
config.py                 shared settings (UA, rate limits, schema, paths)
scrapers/                 common.py + 4 scrapers
data/raw/pilot/           pilot HTML/JSON evidence
data/processed/           per-method CSVs + ml_products.csv
networking/               run_benchmark.sh, results/, pcaps/ (gitignored),
                          firewall/, proxy/, screenshots/
notebooks/                network_analysis.ipynb, ml_analysis.ipynb
reports/                  final_report.pdf
presentation/             slides
```

## Team Responsibilities
- Person 1: Selenium, BeautifulSoup, networking evidence
- Person 2: API, multithreading, data analysis, ML

Branches: `feature/scraping-network`, `feature/api-ml` → reviewed merges into `main`.

## Deadline
Wednesday, November 25, 2026 (pilot working by November 11).

## Data Attribution
Data source: Open Food Facts — https://world.openfoodfacts.org/
Licensed under the Open Database Licence (ODbL).
