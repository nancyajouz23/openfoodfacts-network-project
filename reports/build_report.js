const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ImageRun, Footer, PageNumber, LevelFormat, PageBreak, TableOfContents,
  VerticalAlign,
} = require("docx");

const ROOT = "C:/Users/Nancy/Desktop/Lab Network/openfoodfacts-network-project";
const SHOT = ROOT + "/networking/screenshots/";
const FIG = ROOT + "/reports/figures/";
const OUT = ROOT + "/reports/final_report.docx";

const FONT = "Times New Roman";
const TEXT_W = 9026; // A4 width minus 2 x 2.54 cm margins, in twips

// ---------- inline text: **bold**, `code`, *italic* ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Courier New", size: 21, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (text) => new Paragraph({ children: runs(text), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 360 } });
const H1 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, pageBreakBefore: false });
const H2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
const BUL = (text) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level: 0 }, alignment: AlignmentType.LEFT, spacing: { after: 60, line: 360 } });
const NUM = (text, ref = "steps") => new Paragraph({ children: runs(text), numbering: { reference: ref, level: 0 }, alignment: AlignmentType.LEFT, spacing: { after: 60, line: 360 } });
const CODE = (lines) => lines.map((l, i) => new Paragraph({
  children: [new TextRun({ text: l.length ? l : " ", font: "Courier New", size: 19 })],
  spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
  indent: { left: 567 },
}));

// ---------- figures ----------
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function FIGURE(file, caption, maxW = 580, maxH = 560) {
  const { w, h } = pngSize(file);
  let width = maxW, height = Math.round((h / w) * maxW);
  if (height > maxH) { height = maxH; width = Math.round((w / h) * maxH); }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height },
        altText: { title: caption, description: caption, name: path.basename(file) } })],
    }),
    new Paragraph({ children: runs(caption, { size: 22 }), alignment: AlignmentType.CENTER, spacing: { after: 240, line: 276 } }),
  ];
}

// ---------- tables ----------
const B = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B };
function TABLE(caption, header, rows, widths, align) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, i, head, keep) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({
      children: runs(String(t), { size: 21, bold: head || undefined }),
      alignment: head ? AlignmentType.CENTER : ((align && align[i]) || AlignmentType.LEFT),
      spacing: { after: 0, line: 252 }, keepNext: keep,
    })],
  });
  return [
    new Paragraph({ children: runs(caption, { size: 22 }), alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200, after: 80, line: 276 } }),
    new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: widths, borders: BORDERS,
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: header.map((t, i) => cell(t, i, true, true)) }),
        ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false, k < rows.length - 1)) })),
      ],
    }),
    new Paragraph({ text: "", spacing: { after: 160 } }),
  ];
}
const C = AlignmentType.CENTER, L = AlignmentType.LEFT, R = AlignmentType.RIGHT;

// =====================================================================
const body = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? body.push(...x) : body.push(x)));

// ---------- title page ----------
add(
  new Paragraph({ text: "", spacing: { before: 1800 } }),
  new Paragraph({ alignment: C, spacing: { after: 240, line: 360 }, children: [new TextRun({ text: "[University Name] – [Faculty Name]", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 720, line: 360 }, children: [new TextRun({ text: "Computer & Communications Engineering – Lab Network Programming", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 480, line: 360 }, children: [new TextRun({ text: "Analyzing Website Data Collection Efficiency and Network Behavior Using Multiple Web Scraping Techniques", bold: true, size: 32 })] }),
  new Paragraph({ alignment: C, spacing: { after: 960, line: 360 }, children: [new TextRun({ text: "Case study: Open Food Facts (https://world.openfoodfacts.org)", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 120, line: 360 }, children: [new TextRun({ text: "Prepared by:", bold: true, size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 60, line: 360 }, children: [new TextRun({ text: "[Student 1 Name]", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 480, line: 360 }, children: [new TextRun({ text: "[Student 2 Name]", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 120, line: 360 }, children: [new TextRun({ text: "Submitted to:", bold: true, size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 480, line: 360 }, children: [new TextRun({ text: "[Instructor Name]", size: 24 })] }),
  new Paragraph({ alignment: C, spacing: { after: 60, line: 360 }, children: [new TextRun({ text: "25 November 2026", size: 24 })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- abstract ----------
add(
  new Paragraph({ alignment: C, spacing: { after: 240 }, children: [new TextRun({ text: "Abstract", bold: true, size: 28 })] }),
  P("This project compares four ways of collecting nutritional data from the Open Food Facts website: browser automation with Selenium, HTML parsing with BeautifulSoup, direct calls to the Open Food Facts API, and a multithreaded version of the API scraper. All four methods collected the same eleven fields for the same 40 products, and each method was run three times on one laptop while the traffic was recorded with tcpdump and analysed with Wireshark and tshark. All methods extracted 100% of the products and fields. The API was clearly the most efficient: it needed 40 HTTP requests and about 96 KB of Open Food Facts traffic per run, against 81 requests and 1.6 MB for BeautifulSoup and 792 requests and 4.7 MB for Selenium. Its average latency per product was 79 ms, compared with 386 ms and 660 ms. Multithreading did not shorten the runs, because all threads shared the same rate limit of one request every 5.1 seconds. We also found that Chrome, in its default configuration, downloaded about 33 MB of its own data during every Selenium run. A firewall test with UFW showed that all scrapers stop safely when HTTPS is blocked. In the second part of the project, K-Means and Agglomerative Hierarchical Clustering were applied to 200 products; both methods selected five clusters and agreed closely with each other (Adjusted Rand Index of 0.92)."),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ alignment: C, spacing: { after: 240 }, children: [new TextRun({ text: "Table of Contents", bold: true, size: 28 })] }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- 1 Introduction ----------
add(
  H1("1. Introduction"),
  P("Web scraping is a common way to collect data from websites, but the choice of method has a direct effect on the network. A full browser downloads every resource of a page, a plain HTTP client downloads only the HTML, and an API returns only the requested data. These differences affect speed, bandwidth, the number of requests sent to the server, and the load placed on the website."),
  P("The objective of this project was to measure these differences on a real website instead of discussing them only in theory. We implemented three scraping methods required by the course (Selenium, BeautifulSoup and API-based scraping), added a multithreaded API variant, measured their network behaviour with Linux tools, tested how they behave when HTTPS is blocked by a firewall, and used the collected data in a machine learning analysis."),
  H2("1.1 Research Question"),
  P("The project was guided by one question: **which method (Selenium, BeautifulSoup or the API) collects nutritional data from Open Food Facts most efficiently and reliably, considering runtime, bandwidth, number of requests, latency and data completeness?**"),
  H2("1.2 Division of Work"),
  P("The work was divided between the two team members. Student 1 implemented the Selenium and BeautifulSoup scrapers, the benchmark and packet-capture scripts, the firewall test and the network measurements. Student 2 implemented the API and multithreaded API scrapers and the machine learning analysis. The product dataset, the report and the final recommendation were prepared together."),
);

// ---------- 2 Setup ----------
add(
  H1("2. Setup and Target Definition"),
  H2("2.1 Target Website"),
  P("We selected **Open Food Facts**, an open database of food products maintained by volunteers. It was a suitable target for this comparison because the same product information is available both as a normal web page (`/product/<barcode>`) and through a public JSON API (`/api/v2/product/<barcode>`). This allowed us to compare all methods on exactly the same data. The data is published under the Open Database Licence (ODbL), and Open Food Facts is credited as the source in this report and in the repository."),
  H2("2.2 Data Fields"),
  P("Every scraper writes the same eleven columns to a CSV file. Nutritional values are taken from the \"as sold, per 100 g\" values, never from the \"per serving\" values. Table 2.1 lists the fields."),
  ...TABLE("Table 2.1: Data fields collected for each product.",
    ["Column", "Source field", "Unit or rule"],
    [
      ["barcode", "code", "Stored as text to keep leading zeros"],
      ["product_name", "product_name", "Blank if missing"],
      ["brand", "brands", "Blank if missing"],
      ["category", "Our search tag", "One category per product"],
      ["sugar_100g", "nutriments.sugars_100g", "g per 100 g"],
      ["fat_100g", "nutriments.fat_100g", "g per 100 g"],
      ["protein_100g", "nutriments.proteins_100g", "g per 100 g"],
      ["salt_100g", "nutriments.salt_100g", "g per 100 g"],
      ["calories_100g", "nutriments.energy-kcal_100g", "kcal per 100 g; computed as kJ / 4.184 if missing"],
      ["calories_estimated", "Computed", "True when calories were computed from kJ"],
      ["nutriscore", "nutriscore_grade", "A to E; blank when unknown"],
    ], [2200, 3000, 3826]),
  H2("2.3 Product Sample"),
  P("We built two product lists with a collection script (`scrapers/collect_dataset.py`). The first list contains **200 products** for the machine learning analysis: 50 breakfast cereals, 50 biscuits, 50 chocolates and 50 yogurts. They were collected with paged API searches, restricted to products sold in France and to products whose nutrition facts are marked as complete. Only five searches were needed. Of the 250 products returned, one was removed because a nutrient was missing, no duplicates or impossible values (more than 100 g per 100 g, or more than 900 kcal) were found, and 49 valid biscuits were not needed after the category reached 50 products."),
  P("The second list contains the **40 benchmark products** used by every scraper: 10 products per category, drawn at random from the 200 with `random_state=42`. Using the same 40 barcodes for all methods ensures that differences in the results come from the scraping method and not from the products."),
  H2("2.4 Test Environment"),
  P("All benchmark results in the main part of this report were measured on one laptop running Windows 11 with **WSL2 (Ubuntu 26.04)**, Python 3.14 and Chrome 157, connected through home Wi-Fi. BeautifulSoup and Selenium were measured on 14 November 2026 and the two API methods on 19 November 2026. Using one machine and one network keeps the comparison fair, because latency and speed depend strongly on the computer and the connection. Some additional runs made on the second team member's laptop are reported separately in Appendix A."),
  H2("2.5 Responsible Scraping Rules"),
  P("Open Food Facts allows at most 15 product reads per minute per IP address and may block clients that send more. We therefore applied the following rules to every scraper:"),
  BUL("A shared rate limiter enforces a minimum gap between two product requests: 5.0 s for the BeautifulSoup and Selenium runs, and 5.1 s for the API runs (the interval was increased slightly to keep a safety margin)."),
  BUL("Every request carries a descriptive User-Agent, `OFFNetworkLab/1.0 (<team email>)`, as requested by the Open Food Facts documentation."),
  BUL("If the server answers with HTTP 429 (too many requests) or 503 (service unavailable), the scraper waits 60 s before retrying, with at most three attempts."),
  BUL("Only one benchmark runs at a time. No proxy or Tor is used to avoid the limits."),
  P("We also checked `robots.txt`: product pages (`/product/...`) are allowed for all crawlers, which is what the two HTML scrapers access."),
);

// ---------- 3 Implementation ----------
add(
  H1("3. Implementation"),
  H2("3.1 Shared Components"),
  P("To make the methods comparable, all scrapers share the same code for settings, output format, logging and rate limiting. `config.py` holds the URLs, the User-Agent, the request interval and the CSV columns. `scrapers/common.py` contains the CSV writer, the request logger and the thread-safe rate limiter. `scrapers/metrics.py` reads the 40 benchmark barcodes and writes one summary row per run. Each request is logged to `networking/results/request_log.csv` with its timestamp, HTTP status, latency, waiting time and error message, and each run adds one row to `networking/results/metrics_runs.csv`."),
  P("The rate limiter reserves a time slot for each request while holding a lock, and then sleeps outside the lock. This allows several threads to use the same limiter safely, which is needed for the multithreaded scraper:"),
  ...CODE([
    "def wait(self):",
    "    with self.lock:",
    "        now = time.monotonic()",
    "        slot = max(now, self.next_allowed)",
    "        self.next_allowed = slot + self.interval",
    "    wait_time = max(0.0, slot - now)",
    "    if wait_time > 0:",
    "        time.sleep(wait_time)",
    "    return wait_time",
  ]),
  H2("3.2 Pilot Test"),
  P("Before writing the HTML scrapers, we ran a pilot on five products (at least one per category) and saved the raw HTML pages and API responses in `data/raw/pilot/`. The pilot answered three practical questions. First, the product page contains two nutrition tables: one with the \"as sold for 100 g\" values and a second one that lists values by source (manufacturer, packaging and per serving). Both HTML scrapers read only the first table, located under the element `#panel_nutrition_facts_table_content`. Second, the values in this table matched the API for all five products. Third, the page is fully rendered on the server, so BeautifulSoup can read all fields without running JavaScript."),
  H2("3.3 Selenium Scraper"),
  P("The Selenium scraper (`scrapers/selenium_scraper.py`) starts a headless Chrome browser with a new temporary profile for each run, so every run starts with an empty cache. For each barcode it opens the product page, waits for the page to load, and reads the values from the rendered page. The nutrition table is read with one JavaScript call that returns all table rows, and the name, brand and Nutri-Score are read with `find_elements`. Rows are matched by their label (for example \"Sugars\" or \"Fat\") rather than by position, because the order of rows changes between products."),
  P("To count requests, we enabled Chrome's performance log (`goog:loggingPrefs`), which records every request the browser makes. Requests answered from Chrome's own cache are counted separately, so the reported number only includes requests that actually went over the network. During testing we found that Chrome contacts several Google services for its own purposes, even with background networking disabled. We therefore turned off these features (optimization models, autofill, translation) and blocked their host names inside Chrome. The location of chromedriver is also found before the packet capture starts, so that Selenium Manager's online version check is not measured. The effect of this change is discussed in Section 4.6."),
  H2("3.4 BeautifulSoup Scraper"),
  P("The BeautifulSoup scraper (`scrapers/bs4_scraper.py`) downloads each product page with the `requests` library and parses it with BeautifulSoup. It never calls the API. One `requests.Session` is used for the whole run, so the same TCP and TLS connection is reused for all products (HTTP keep-alive). A response hook on the session counts every HTTP response, including redirects. Each product page answers with one redirect, from `/product/<barcode>` to `/product/<barcode>/<product-name>`, so the scraper sends two requests per product. Numbers such as `1,624 kJ (384 kcal)` or `~ 0.08 g` are converted to floating-point values by a small parser that is shared with the Selenium scraper, so both HTML methods read the values in the same way."),
  H2("3.5 API Scraper"),
  P("The API scraper (`scrapers/api_scraper.py`) sends one request per product to the version 2 product endpoint and asks only for the fields we need:"),
  ...CODE(["GET /api/v2/product/<barcode>?fields=code,product_name,brands,nutriments,nutriscore_grade"]),
  P("The JSON answer is mapped directly into the shared CSV columns. Version 2 of the API was chosen on purpose: the Open Food Facts documentation recommends newer versions for new applications, but version 2 still provides the structured category search used to build our dataset and the flat nutrition fields used by our schema."),
  H2("3.6 Multithreaded API Scraper"),
  P("The multithreaded scraper (`scrapers/api_threaded.py`) uses a `ThreadPoolExecutor` with three worker threads. Each thread has its own `requests.Session`, and all threads share the same rate limiter, the same parser and the same output format as the normal API scraper. Because every request must first reserve a slot from the shared limiter, the threads can overlap their waiting and their processing, but they cannot send requests faster than the allowed rate. This was a deliberate design choice: the course asked for multithreading, and Open Food Facts asked for a limited request rate."),
  H2("3.7 Output Validation"),
  P("We checked that the methods produce the same data. During the pilot and test runs, the values extracted by BeautifulSoup and Selenium were identical to the API values for every product checked (sugar, fat, protein, salt, calories, Nutri-Score and brand). The normal and multithreaded API scrapers produced exactly the same CSV content for the 40 benchmark products. The only field that differs between the HTML and API methods is the product name: the website shows the English name when one exists, while the API returns the name in the product's main language (French for most of our products). Products were therefore matched by barcode, and the nutrition values were not affected."),
);

// ---------- 4 Networking ----------
add(
  H1("4. Networking Observation"),
  H2("4.1 Measurement Procedure"),
  P("Each benchmark run was started with the script `networking/run_benchmark.sh <method> <run>`. The script makes sure that setup traffic is not included in the measurement and that two runs never overlap. It performs the following steps:"),
  NUM("Resolve the Open Food Facts host names and save their IP addresses for the run.", "steps"),
  NUM("For Selenium only, locate chromedriver before the capture.", "steps"),
  NUM("Start `tcpdump -i any` and write all packets to `networking/pcaps/<method>_run<n>.pcap`.", "steps"),
  NUM("Run exactly one scraper on the 40 barcodes, while saving `ss` snapshots of open TCP connections every 5 s.", "steps"),
  NUM("Stop the capture and count packets and bytes with tshark.", "steps"),
  P("Every method was run three times. Bandwidth is reported in two ways. **Open Food Facts traffic** includes only packets to or from Open Food Facts IP addresses. **Total traffic** includes all packets except loopback traffic (127.0.0.1). Loopback traffic was excluded because, for Selenium, it contains the control messages between Python, chromedriver and Chrome (53 to 56 MB per run), which never leave the laptop. Latency is the time from sending a request to receiving the full response; for Selenium it is measured until the page load event. Active time is the total time minus the waiting imposed by the rate limiter."),
  H2("4.2 Tools Used"),
  ...TABLE("Table 4.1: Linux tools and how they were used.",
    ["Tool", "Use in this project"],
    [
      ["ss -t -a", "Open TCP connections of the scrapers during each run"],
      ["nload, iftop", "Live bandwidth on the eth0 interface during the runs"],
      ["tcpdump", "One packet capture file per run"],
      ["Wireshark", "Conversations per IP address and traffic over time (I/O graph)"],
      ["tshark", "Automatic counting of packets and bytes in each capture"],
      ["ufw", "Blocking outgoing HTTPS for the firewall test (Section 5.2)"],
    ], [2400, 6626]),
  H2("4.3 Results"),
  P("Table 4.2 summarises the results using the metrics requested in the project brief. Each value is the average of three runs of 40 products. All methods extracted 40 out of 40 products with 100% field completeness in every run."),
  ...TABLE("Table 4.2: Comparison of scraping methods (average of 3 runs, 40 products per run).",
    ["Method", "Bandwidth, Open Food Facts (KB)", "Bandwidth, total (KB)", "Time (s)", "HTTP requests", "Avg. latency (ms)", "Active time (s)"],
    [
      ["API", "96", "130", "199.0", "40", "79", "3.7"],
      ["Threaded API", "114", "122", "199.0", "40", "89", "3.6"],
      ["BeautifulSoup", "1,603", "1,607", "235.6*", "81", "386", "20.0"],
      ["Selenium", "4,657", "4,864", "196.9", "792", "660", "32.3"],
      ["Selenium (default Chrome)", "4,463", "37,379", "218.6*", "791", "646", "33.5"],
    ], [2026, 1250, 1150, 1000, 1150, 1250, 1200], [L, R, R, R, R, R, R]),
  P("*One run of BeautifulSoup and one run of Selenium with default Chrome received HTTP 503 errors from the server (three errors in total). Each error added a 60 s back-off, which raised the average. The median times were 195.5 s and 200.1 s. All three products were collected successfully on the next attempt."),
  P("The total time is almost the same for every method, at about 196 s (5.0 s interval) or 199 s (5.1 s interval). This is expected: 40 products multiplied by the rate-limit interval gives about 200 s, so the rate limit, and not the scraping method, determines the total time. The differences between the methods appear in the number of requests, the bandwidth, the latency and the active time."),
  P("The API sent half as many requests as BeautifulSoup and twenty times fewer than Selenium. It transferred about 17 times less data than BeautifulSoup and about 48 times less than Selenium, because the response contains only the requested JSON fields instead of a complete web page. Its average latency was 79 ms, about five times lower than BeautifulSoup and eight times lower than Selenium. The total API traffic (130 KB) is higher than its Open Food Facts traffic (96 KB) mainly because of the first run, during which Ubuntu itself contacted Canonical servers (Section 4.5)."),
  ...FIGURE(FIG + "net_bandwidth.png", "Figure 4.1: Bandwidth per 40-product run for each method (log scale)."),
  ...FIGURE(FIG + "net_requests_latency.png", "Figure 4.2: HTTP requests per run and average latency per product."),
  H2("4.4 Traffic Over Time"),
  P("Figure 4.3 shows the traffic of one run of each method in intervals of 10 s. The API methods stay at about 4 to 5 KB every 10 s, BeautifulSoup at about 80 KB and Selenium at about 140 to 180 KB. Both Selenium runs start with about 1.7 MB in the first interval, because the first page is loaded with an empty cache and all style sheets, scripts and images must be downloaded. Later pages reuse most of these files from Chrome's cache. With Chrome's default configuration, the traffic rises to about 22 MB in the next 10 s, which is the background download described in Section 4.6. The threaded API also starts slightly higher than the normal API, because its three threads open three separate TLS connections."),
  ...FIGURE(FIG + "net_traffic_time.png", "Figure 4.3: Network traffic per 10 s during run 2 of each method (log scale)."),
  H2("4.5 Wireshark Analysis"),
  P("We opened the captures in Wireshark and used Statistics, Conversations to see which servers each method talked to. For BeautifulSoup (Figure 4.4), almost all traffic belongs to a single conversation with the Open Food Facts server 151.115.132.10: 817 packets and about 1.6 MB. For the API (Figure 4.5), the same server accounts for only 139 packets and 96 KB. The API capture also contains short conversations with 91.189.91.x and 185.125.190.x. These addresses belong to Canonical, the company that maintains Ubuntu, so this is background traffic from the operating system and not from our scraper. It explains why the total traffic of the first API run (188 KB) was higher than that of the other two runs (101 KB)."),
  ...FIGURE(SHOT + "wireshark_conversations_bs4_run1.png", "Figure 4.4: Wireshark conversations for BeautifulSoup run 1."),
  ...FIGURE(SHOT + "wireshark_conversations_api_run1.png", "Figure 4.5: Wireshark conversations for API run 1."),
  P("The Selenium capture with default Chrome (Figure 4.6) is very different. Besides the Open Food Facts servers, it contains a 35 MB conversation with 172.217.115.4, which the TLS server name identifies as `optimizationguide-pa.googleapis.com`, and a 6 MB conversation with 185.199.110.153 (`googlechromelabs.github.io`), which is Selenium Manager checking the chromedriver version. The 53 MB of loopback traffic between Python, chromedriver and Chrome is also visible. The I/O graph of the same capture (Figure 4.7) shows the large burst of packets in the first 30 s, followed by regular peaks every 5 s, one for each product page."),
  ...FIGURE(SHOT + "wireshark_conversations_selenium_default_run1.png", "Figure 4.6: Wireshark conversations for Selenium run 1 with default Chrome settings."),
  ...FIGURE(SHOT + "wireshark_io_graph_selenium_default_run1.png", "Figure 4.7: Wireshark I/O graph for Selenium run 1 with default Chrome settings.", 520),
  H2("4.6 Further Observations"),
  P("**Selenium loads the whole page.** On average Chrome sent about 20 network requests per product: the page and its redirect, Open Food Facts API calls made by the page's own scripts (`/api/v3`, Robotoff and Folksonomy), three analytics requests, the product image and static files. In run 1 the requests were distributed as follows: 324 to world.openfoodfacts.org, 272 to static.openfoodfacts.org, 118 to analytics.openfoodfacts.org and 40 each to the image, Robotoff and Folksonomy servers. About 80% of all resources requested by the page were served from Chrome's cache after the first product. The first product took about 1.8 s and 91 requests, while the following products took about 0.6 s and 16 to 22 requests."),
  P("**Default Chrome adds a large hidden cost.** In its default configuration Chrome downloaded about 33 MB of data that had nothing to do with the products during every run. After we disabled these features and blocked the corresponding hosts, the Open Food Facts traffic stayed the same (about 4.6 MB), while the total traffic fell from 37.4 MB to 4.9 MB per run. This shows that a browser-based scraper must be configured carefully, and that only measuring the traffic to the target website would hide this cost. Figures 4.8 and 4.9 show nload during a Selenium run before and after the change: the peak incoming rate fell from 33.8 Mbit/s to about 1 Mbit/s."),
  ...FIGURE(SHOT + "selenium_default_nload_spike.png", "Figure 4.8: nload at the start of a Selenium run with default Chrome settings.", 420),
  ...FIGURE(SHOT + "selenium_run3_nload.png", "Figure 4.9: nload (left) and the Selenium scraper (right) after disabling Chrome's background traffic."),
  P("**Compression and connection reuse help BeautifulSoup.** Python received 9.4 MB of decompressed HTML during each BeautifulSoup run, but only 1.6 MB crossed the network, because the server compresses pages with gzip (about six times smaller). The `ss` snapshots showed a single Python connection to 151.115.132.10:443 during the whole run, which confirms that the session reused one TCP and TLS connection."),
  P("**Multithreading did not improve the API on our laptop.** The `ss` output during the threaded run (Figure 4.10) shows three established Python connections to the server, one per thread. Because the shared limiter allows only one request every 5.1 s, the threads mostly wait for their turn. As a result the threaded scraper had the same total time (199.0 s) and almost the same active time (3.6 s against 3.7 s) as the normal API scraper. Its average latency was slightly higher (89 ms against 79 ms), and it transferred about 18% more data because of the two extra TLS handshakes. Multithreading would only help if the rate limit were higher or if the processing per product were slower."),
  ...FIGURE(SHOT + "api_threaded_run1_ss.png", "Figure 4.10: Threaded API run (left) and `ss -t -a -p | grep python` showing three connections (right)."),
  ...FIGURE(SHOT + "api_run2_nload.png", "Figure 4.11: API run 2 (left) and nload (right): the traffic stays at a few kbit/s."),
);

// ---------- 5 Security ----------
add(
  H1("5. Security and Responsible Use"),
  H2("5.1 Rate Limiting and Error Handling"),
  P("The rules described in Section 2.5 were applied in all runs. Across the 15 benchmark runs on our laptop (600 product reads), the server answered with HTTP 503 three times, all during the BeautifulSoup and Selenium runs on 14 November; every other request (600 in total) returned HTTP 200. In each case the scraper logged the error, waited 60 s and collected the product on the next attempt, so no product was lost. No HTTP 429 response was received, which indicates that our request rate stayed within the allowed limit."),
  H2("5.2 Firewall Test with UFW"),
  P("To see how each scraper behaves when the network is blocked, we enabled UFW and added the rule `sudo ufw deny out 443`, which blocks all outgoing HTTPS traffic for IPv4 and IPv6. The script `networking/firewall/ufw_test.sh` then ran each scraper on one product and removed the rule at the end, even if the test was interrupted. The `deny` action drops packets without sending any answer, so the client can only detect the problem through its own timeout. Table 5.1 shows the results."),
  ...TABLE("Table 5.1: Behaviour of each scraper when outgoing HTTPS is blocked.",
    ["Method", "Error raised", "Time per attempt (s)", "Attempts", "Total time until it gave up (s)"],
    [
      ["BeautifulSoup", "ConnectTimeout", "30.1", "3", "271.3"],
      ["Selenium", "TimeoutException (renderer timeout)", "30.0", "3", "274.1"],
      ["API", "ConnectTimeout", "30.0", "3", "211.0"],
      ["Threaded API", "ConnectTimeout", "30.0", "3", "211.5"],
    ], [1900, 2826, 1400, 1100, 1800], [L, L, R, R, R]),
  P("All four scrapers failed in the same controlled way. Each attempt ended after exactly our 30 s timeout, the error was written to the log, the product was saved as an empty row, and the program finished without crashing. The difference in total time comes from the scrapers themselves: the BeautifulSoup and Selenium tests were run before we removed an unnecessary 60 s wait after the third failed attempt, which the API scrapers did not have. DNS resolution still worked because port 53 was not blocked, so only the TCP handshake to port 443 received no reply. The error messages also differed: the `requests` library reported the host, port and cause clearly, while Selenium only reported that the renderer had timed out, which is harder to diagnose."),
  ...FIGURE(SHOT + "ufw_test.png", "Figure 5.1: UFW test for BeautifulSoup and Selenium: rule added, both scrapers time out, rule removed.", 470),
  ...FIGURE(SHOT + "ufw_test_api.png", "Figure 5.2: UFW test for the API and threaded API scrapers."),
  H2("5.3 Multithreading"),
  P("Multithreading was implemented in the threaded API scraper (Section 3.6). Because all threads share one lock-protected rate limiter, using threads did not increase the request rate. A check made by the second team member on consecutive requests of the threaded scraper found a minimum gap of 5.1 s between request start times, which confirms that the limiter worked as intended with three threads."),
  H2("5.4 Proxy Server"),
  P("Configuring a proxy server (Squid or Tor) was optional in the project brief, and we did not include it in our measurements. We decided not to use Tor in particular, because routing requests through it could look like an attempt to avoid the website's rate limits."),
);

// ---------- 6 ML ----------
add(
  H1("6. Data Cleaning and Analysis"),
  P("The second part of the project uses the 200-product dataset (`data/processed/ml_products.csv`) to group foods by their nutritional profile. The analysis was carried out in the notebook `notebooks/ml_analysis.ipynb` with pandas, Matplotlib, Seaborn and scikit-learn."),
  H2("6.1 Data Preparation"),
  P("The cleaning rules were applied again in the notebook. The final dataset contains 200 products with no duplicate barcodes, no missing values in the five numerical features and no impossible values. The five features used for clustering are sugar, fat, protein, salt and calories per 100 g. The category and Nutri-Score were not used as inputs; they were kept only to interpret the clusters afterwards. Before clustering, the features were standardised with `StandardScaler` so that calories, which have much larger values than the other features, would not dominate the distance calculation."),
  H2("6.2 Exploratory Data Analysis"),
  P("Figure 6.1 shows the distribution of the five features. Table 6.1 gives the average values per category, and Figure 6.2 shows the average calories per category. Chocolates have the highest average sugar, fat and calories, yogurts the lowest calories and fat, and biscuits and breakfast cereals lie in between."),
  ...FIGURE(FIG + "ml_distributions.png", "Figure 6.1: Distributions of sugar, fat, protein, salt and calories per 100 g.", 560, 380),
  ...TABLE("Table 6.1: Average nutritional values per category (per 100 g).",
    ["Category", "Sugar (g)", "Fat (g)", "Protein (g)", "Salt (g)", "Calories (kcal)"],
    [
      ["Biscuits", "19.38", "16.46", "7.59", "0.48", "436.55"],
      ["Breakfast cereals", "14.18", "10.65", "9.97", "0.17", "408.02"],
      ["Chocolates", "30.83", "41.43", "8.07", "0.06", "573.40"],
      ["Yogurts", "6.97", "3.57", "4.80", "0.13", "79.02"],
    ], [2026, 1400, 1400, 1400, 1400, 1400], [L, R, R, R, R, R]),
  ...FIGURE(FIG + "ml_category_calories.png", "Figure 6.2: Average calories per category.", 480),
  P("The correlation matrix (Figure 6.3) shows that fat has the strongest relationship with calories (0.81), followed by sugar (0.58) and protein (0.51). Salt is almost unrelated to calories (0.09). This agrees with the fact that fat provides the most energy per gram."),
  ...FIGURE(FIG + "ml_correlation.png", "Figure 6.3: Correlation between the nutritional features.", 420),
  H2("6.3 K-Means Clustering"),
  P("K-Means was run with `random_state=42` and `n_init=10` for K = 2 to 6. Table 6.2 lists the inertia and silhouette score for each value. The elbow curve (Figure 6.4) flattens after K = 4 or 5, and the silhouette score is highest at K = 5 (0.488), so we selected five clusters."),
  ...TABLE("Table 6.2: K-Means results for K = 2 to 6.",
    ["K", "Inertia", "Silhouette score"],
    [["2", "633.05", "0.392"], ["3", "438.84", "0.423"], ["4", "286.93", "0.476"], ["5", "222.30", "0.488"], ["6", "193.83", "0.438"]],
    [1500, 2500, 2500], [C, R, R]),
  ...FIGURE(FIG + "ml_elbow.png", "Figure 6.4: Elbow curve for K-Means.", 400),
  ...FIGURE(FIG + "ml_silhouette_kmeans.png", "Figure 6.5: Silhouette scores for K-Means.", 400),
  P("Table 6.3 describes the five clusters and Figure 6.6 shows them on the first two principal components, which together explain 72.6% of the variance. Cluster 2 contains mostly yogurts and has the lowest energy. Cluster 3 contains only chocolates and has the highest fat and calories, while Cluster 4 is also dominated by chocolates but has the highest sugar. Clusters 0 and 1 contain mainly breakfast cereals and biscuits; Cluster 1 has more sugar and salt than Cluster 0."),
  ...TABLE("Table 6.3: Average profile of the K-Means clusters (per 100 g).",
    ["Cluster", "Products", "Sugar (g)", "Fat (g)", "Protein (g)", "Salt (g)", "Calories (kcal)"],
    [
      ["0", "68", "12.97", "12.66", "9.85", "0.13", "414.31"],
      ["1", "30", "24.85", "16.07", "7.07", "0.79", "452.98"],
      ["2", "51", "6.86", "3.58", "4.54", "0.13", "78.78"],
      ["3", "30", "20.38", "46.81", "8.97", "0.03", "592.93"],
      ["4", "21", "46.62", "32.15", "6.63", "0.12", "537.19"],
    ], [1100, 1150, 1300, 1300, 1350, 1300, 1526], [C, R, R, R, R, R, R]),
  ...FIGURE(FIG + "ml_kmeans_pca.png", "Figure 6.6: K-Means clusters shown on the first two principal components.", 480),
  H2("6.4 Agglomerative Hierarchical Clustering"),
  P("As a second method, we applied Agglomerative Hierarchical Clustering to the same standardised features. The silhouette scores for K = 2 to 6 were 0.392, 0.422, 0.470, 0.483 and 0.465, so five clusters were again selected. The resulting groups (Figure 6.7) are very similar to the K-Means groups: one low-calorie yogurt group, one high-fat chocolate group, one high-sugar group and two groups of biscuits and breakfast cereals."),
  ...FIGURE(FIG + "ml_agglo_pca.png", "Figure 6.7: Agglomerative clusters shown on the first two principal components.", 480),
  H2("6.5 Comparison of the Two Methods"),
  P("Table 6.4 compares the two methods. The Adjusted Rand Index (ARI) between the K-Means and Agglomerative assignments is 0.9242, which means the two methods produced almost the same grouping. K-Means had a slightly better silhouette score and a slightly higher agreement with the Nutri-Score, while the Agglomerative method matched the food categories slightly better."),
  ...TABLE("Table 6.4: Comparison of K-Means and Agglomerative clustering.",
    ["Metric", "K-Means", "Agglomerative"],
    [
      ["Silhouette score (K = 5)", "0.4880", "0.4830"],
      ["Agreement with food categories (ARI)", "0.5740", "0.5923"],
      ["Agreement with Nutri-Score (ARI, 198 products)", "0.2128", "0.1994"],
    ], [4826, 2100, 2100], [L, R, R]),
  P("The agreement with the food categories (ARI of about 0.58) shows that the clusters follow the categories only partly. This is reasonable, because a sweet cereal can be nutritionally closer to a biscuit than to a plain muesli. The agreement with the Nutri-Score is low (about 0.2) because the Nutri-Score also depends on factors that were not used in our features, such as saturated fat, fibre and the proportion of fruit and vegetables. Two products without a Nutri-Score were excluded from that comparison. These ARI values should not be read as classification accuracy, since the models were trained without these labels."),
);

// ---------- 7 Recommendation ----------
add(
  H1("7. Optimization Report and Recommendation"),
  P("Based on our measurements, the best strategy for collecting data from Open Food Facts is to **use the official API whenever it provides the required fields**. It collected exactly the same data as the other methods with the fewest requests, the least bandwidth and the lowest latency, and it is also the method that places the smallest load on the website. Table 7.1 summarises when each method is appropriate."),
  ...TABLE("Table 7.1: Recommended use of each method.",
    ["Method", "When to use it", "Main drawback measured"],
    [
      ["API", "Whenever an official API exposes the needed data", "Depends on what the API provides and on its version"],
      ["Threaded API", "Only when the allowed request rate is high enough to benefit from parallel requests", "No gain under a strict rate limit; more connections and data"],
      ["BeautifulSoup", "Server-rendered pages without a suitable API", "2 requests and about 40 KB per product; depends on the HTML structure"],
      ["Selenium", "Pages that need JavaScript, clicks or a login", "About 20 requests per product, analytics traffic, high latency and Chrome background traffic unless disabled"],
    ], [1700, 3663, 3663]),
  P("For stability, three practices were important in our runs: a fixed request rate below the website's limit, a timeout on every request, and a waiting period after HTTP 429 or 503 responses. With these rules all runs completed with every product collected, even though the server returned temporary errors. If a browser is required, Chrome's background features should be disabled and the driver path should be fixed in advance; in our case this reduced the traffic of each Selenium run from 37.4 MB to 4.9 MB without changing the data."),
);

// ---------- 8 Limitations ----------
add(
  H1("8. Limitations"),
  P("Our results describe one laptop, one home network and a sample of 40 products. Absolute values such as latency depend on this setup; the runs on the second team member's laptop (Appendix A) had 1.5 to 2 times higher latency, although the ranking of the methods was the same. Each method was run three times. This was enough to see clear and stable differences (the request counts and bytes varied by less than 4% between runs, except for the operating system traffic in the first API run), but not to measure small effects precisely."),
  P("The captures were taken inside WSL2, which has its own virtual network behind Windows. They therefore contain only the traffic of the Linux environment, which removes Windows background traffic but also means that Windows-level traffic is not represented. The rate-limit interval was 5.0 s for the HTML methods and 5.1 s for the API methods, which adds about 4 s to the API runs; this does not affect the latency, the request counts or the bandwidth. Selenium's request counts come from Chrome's performance log, and its latency includes page rendering. Finally, Open Food Facts changes its data and pages regularly, so repeating the experiment later may give slightly different numbers."),
);

// ---------- 9 Conclusion ----------
add(
  H1("9. Conclusion"),
  P("We implemented and compared four scraping methods on the same 40 Open Food Facts products. All of them collected complete and correct data, but their network cost was very different. The API needed 40 requests and about 96 KB per run, BeautifulSoup 81 requests and 1.6 MB, and Selenium 792 requests and 4.7 MB, with latencies of 79 ms, 386 ms and 660 ms. Under a strict rate limit the total time was the same for all methods, and multithreading did not reduce it. The packet captures also revealed costs that are easy to miss, such as Chrome's 33 MB of background downloads and the operating system's own traffic. The firewall test confirmed that all scrapers fail safely when HTTPS is blocked. In the machine learning part, K-Means and Agglomerative clustering both found five meaningful groups of products and agreed closely with each other. Overall, the project showed that the API is the most efficient and stable choice for Open Food Facts, that BeautifulSoup is a good lightweight alternative for server-rendered pages, and that Selenium should be kept for pages that really require a browser."),
);

// ---------- References ----------
add(
  H1("References"),
  NUM("Lab Network Programming course brief, \"Analyzing Website Data Collection Efficiency and Network Behavior Using Multiple Web Scraping Techniques\" (proj-labnet1.pdf).", "refs"),
  NUM("Open Food Facts Project Plan and Team Agreement (Final), project team document, November 2026.", "refs"),
  NUM("Open Food Facts, https://world.openfoodfacts.org, data available under the Open Database Licence: https://opendatacommons.org/licenses/odbl/1-0/.", "refs"),
  NUM("Open Food Facts API documentation (rate limits, User-Agent, version 2 search), as referenced in the project plan.", "refs"),
  NUM("Selenium documentation, https://www.selenium.dev/documentation/.", "refs"),
  NUM("Beautiful Soup documentation, https://www.crummy.com/software/BeautifulSoup/bs4/doc/.", "refs"),
  NUM("Requests library documentation, https://requests.readthedocs.io/.", "refs"),
  NUM("Wireshark User's Guide, https://www.wireshark.org/docs/.", "refs"),
  NUM("tcpdump manual, https://www.tcpdump.org/manpages/tcpdump.1.html.", "refs"),
  NUM("scikit-learn documentation (KMeans, AgglomerativeClustering, silhouette score, adjusted Rand index), https://scikit-learn.org/stable/.", "refs"),
);

// ---------- Appendix ----------
add(
  new Paragraph({ children: [new PageBreak()] }),
  H1("Appendix A: Runs on the Second Laptop"),
  P("Before the final measurements, the second team member also ran the API, threaded API and BeautifulSoup scrapers on a different laptop and network. These runs were not mixed with the main results, because latency depends on the machine and the connection. They are listed here as a repeat of the experiment in a different environment."),
  ...TABLE("Table A.1: Results on the second laptop (average per run, 40 products).",
    ["Method", "Runs", "Bandwidth, Open Food Facts (KB)", "HTTP requests", "Avg. latency (ms)", "Active time (s)"],
    [
      ["API", "3", "100", "40", "168", "6.7"],
      ["Threaded API", "4", "116", "40", "144", "5.8"],
      ["BeautifulSoup", "3", "1,680", "82", "566", "29.3"],
    ], [2026, 900, 1700, 1400, 1500, 1500], [L, C, R, R, R, R]),
  P("The request counts and bandwidth are almost identical to our main results, which shows that these metrics do not depend on the machine. The latency and active time were 1.5 to 2 times higher for every method, but the ranking of the methods was the same. On this laptop, the threaded API had a lower latency than the normal API, while on our main laptop it was slightly higher; the effect of threading is therefore small and depends on the network."),
  H1("Appendix B: Repository Structure"),
  ...TABLE("Table B.1: Main folders and files of the project repository.",
    ["Path", "Content"],
    [
      ["config.py", "Shared settings: URLs, User-Agent, request interval, CSV columns"],
      ["scrapers/", "Dataset collection, pilot, the four scrapers, shared rate limiter and metrics"],
      ["data/barcodes_benchmark.csv", "The 40 benchmark products"],
      ["data/processed/", "Output CSV of every run and the 200-product ML dataset"],
      ["data/raw/pilot/", "HTML pages, API responses and notes from the pilot"],
      ["networking/run_benchmark.sh", "Runs one capture and one scraper"],
      ["networking/results/", "metrics_runs.csv, request_log.csv, pcap_bytes.csv, ss snapshots"],
      ["networking/firewall/", "UFW test script and outputs"],
      ["networking/screenshots/", "Screenshots used in this report"],
      ["notebooks/", "Network analysis and machine learning notebooks"],
    ], [3400, 5626]),
  P("Packet capture files are not stored in the repository because of their size; the byte counts extracted from them are kept in `networking/results/pcap_bytes.csv`."),
);

// =====================================================================
const doc = new Document({
  creator: "Lab Network Programming team",
  title: "Analyzing Website Data Collection Efficiency and Network Behavior Using Multiple Web Scraping Techniques",
  features: { updateFields: true },
  styles: {
    default: {
      document: { run: { font: FONT, size: 24, color: "000000" }, paragraph: { spacing: { line: 360 } } },
      heading1: { run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { spacing: { before: 360, after: 180 }, keepNext: true } },
      heading2: { run: { font: FONT, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
      title: { run: { font: FONT, size: 32, bold: true, color: "000000" }, paragraph: { spacing: { before: 0, after: 240 } } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
      { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] },
      { reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 567 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }, titlePage: true },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] }),
      first: new Footer({ children: [new Paragraph({ text: "" })] }),
    },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT, buf.length); });
