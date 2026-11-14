# Five-product pilot (plan 3.2)

Run on 14 Nov 2026 from WSL2 Ubuntu 26.04 (Person 1's laptop), with `python -m scrapers.pilot --selenium`.
User-Agent `OFFNetworkLab/1.0 (<team email>)`, 5 s between requests (`product_limiter`).

| Barcode | Category | Product |
|---|---|---|
| 7613035449626 | breakfast-cereals | Chocapic |
| 7622210476241 | biscuits | Petit brun extra |
| 3045140105502 | chocolates | Milka alpine milk |
| 3329770075313 | yogurts | Yop fraise |
| 3046920028721 | chocolates | Lindt Dark absolute 99 % |

All 5 come from `data/barcodes_benchmark.csv`. Evidence files in this folder: `<barcode>.html` (requests),
`<barcode>.json` (API v2), `<barcode>_selenium.html` + `<barcode>_selenium_requests.json` (Chocapic and Yop only),
`robots.txt`, `pilot_fetch_log.csv`. All requests returned HTTP 200.

## 1. robots.txt
- `User-agent: *` disallows only `/api`, `/cgi` and `/facets`. **Product pages (`/product/...`) are allowed**, so
  BS4 and Selenium are fine.
- `/api` is disallowed for *crawlers*, but the Open Food Facts API docs explicitly invite apps to use the API with an
  identified User-Agent and within the rate limits. State this distinction in the report.

## 2. Which nutrition table the page shows
The page has **two** nutrition tables:

| Element | What it is | Use it? |
|---|---|---|
| `#panel_nutrition_facts_table_content` → first `<table>` | Columns: nutrient, **"As sold for 100 g / 100 ml"**, "Compared to: <category>" | **Yes** |
| `#panel_nutrition_facts_table_with_input_sets_content` → `<table>` | One column per source: manufacturer, packaging, per serving... | No |

Careful: the second table is *inside* `#panel_nutrition_facts_table`, so a selector like
`#panel_nutrition_facts_table table` matches both. Take the first table under `#panel_nutrition_facts_table_content`.

**Result: in the first table, column 2 matches the API exactly for all 5 products** (sugar, fat, protein, salt and kcal,
tolerance 0.05 g / 0.5 kcal). The Selenium-rendered page gives the same values.

## 3. Where each field is in the HTML
| Our column | HTML location | Notes |
|---|---|---|
| product_name | `h1[itemprop="name"]` (also `property="food:name"`) | Text is "name – brand – quantity", e.g. `Chocapic – Nestlé – 645 g`. See issue A below |
| brand | `#field_brands_value` | Text `Nestlé , Chocapic`; remove the space before commas to match the API's `Nestlé, Chocapic` |
| calories_100g | row "Energy", column 2: `1,624 kJ (384 kcal)` | Take the number in brackets before "kcal" |
| fat_100g | row "Fat", column 2 | |
| sugar_100g | row "Sugars", column 2 | |
| protein_100g | row "Proteins", column 2 | |
| salt_100g | row "Salt", column 2 | |
| nutriscore | `<img src=".../nutriscore-b-new-en.svg">` | Read the letter from the file name |

Number formats seen: thousands comma (`1,624 kJ`), approximate marker (`~ 0.08 g`), non-breaking spaces.
Parse numbers by removing commas and taking the first number. Use only the row label in column 1
("Sugars", "Fat"...), not the row position, because rows differ between products.

## 4. Is the page server-rendered?
**Yes.** The plain `requests` HTML already contains the nutrition table, brand, name and Nutri-Score image, with the
same values as the Selenium-rendered page. BS4 does not need JavaScript.

## 5. Requests per product
| Method | HTTP requests per product | Size downloaded |
|---|---|---|
| API (`/api/v2/product/<barcode>?fields=...`) | 1 | 1.4–3.2 KB |
| BS4 (`/product/<barcode>`) | 2: the URL redirects to `/product/<barcode>/<name-slug>` | 200–290 KB HTML |
| Selenium | about 127 | (to measure in the benchmark) |

Selenium, per page load (Chocapic / Yop):

| Host | Requests | What |
|---|---|---|
| static.openfoodfacts.org | 102 / 101 | CSS, JS, icons, fonts |
| world.openfoodfacts.org | 18 / 17 | 2 page loads (redirect), images, plus API calls the page makes itself: `/api/v3/external_sources`, `/api/v3.4/attribute_groups`, `/api/v3.4/preferences`, `/cgi/countries.pl`, `/cgi/manifest.pl`, `/data/tagline/web/main.json` |
| analytics.openfoodfacts.org | 4 | Matomo tracking script + 3 pings |
| images.openfoodfacts.org | 1 | product photo |
| robotoff.openfoodfacts.org | 1 | questions API |
| api.folksonomy.openfoodfacts.org | 1 | folksonomy API |

Rate-limit impact: with 5 s spacing, Selenium sends about 6 extra API/cgi calls to world.openfoodfacts.org per
product, on top of the page itself. These are not product reads, but they reach the same servers. Keep the 5 s spacing
(or more) for Selenium.

## 6. Open issues to agree with Person 2
**A. Product names do not match.** The world site shows the English name if one exists, and the API v2
`product_name` returns the product's main-language name (French here):

| Barcode | HTML h1 (name part) | API product_name |
|---|---|---|
| 7613035449626 | Chocapic | NESTLE CHOCAPIC Céréales 645g |
| 3045140105502 | Milka Alpine Milk Chocolate Bar | Chocolat au lait du pays alpin Milka |
| others | same as API | |

Options: (1) treat the name as a text field that is not compared, and match products by barcode (simplest);
(2) cut " – brand – quantity" off the h1 and accept that the language can differ; (3) ask the API for
`product_name_en` as well. Nutrition values are not affected.

**B. Selenium sends analytics pings** (Matomo) for every page. Either keep them (measure the browser as it is) or block
`analytics.openfoodfacts.org` in Chrome so our benchmark does not pollute their visitor statistics. Pick one and state
it in the report.

## First finding for the report
The API answer is about **100 times smaller** than the HTML page (≈2 KB vs ≈230 KB), and Selenium makes about
**127 requests** per product versus 2 for BS4 and 1 for the API.
