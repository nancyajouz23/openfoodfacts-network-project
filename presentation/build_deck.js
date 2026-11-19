const fs = require("fs");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("C:/Users/Nancy/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/05e44020-1500-4a08-90df-3af7e55eac64/b4509989-ae1f-4d56-806e-dd70486122f4/skills/pptx/scripts/apply_theme.js");

const ROOT = "C:/Users/Nancy/Desktop/Lab Network/openfoodfacts-network-project";
const SHOT = ROOT + "/networking/screenshots/";
const FIG = ROOT + "/reports/figures/";
const OUT = ROOT + "/presentation/final_presentation.pptx";

// ---------- palette ----------
const COL = {
  ink: "1F2A30", muted: "6B7782", line: "D5DBE0", bg2: "F2F5F7", tint: "E5F1F0",
  api: "0B6E69", thr: "5FB3AC", bs4: "7B8794", sel: "E07A2D", red: "B23A2E", white: "FFFFFF",
};
const METHOD = {
  sel: { name: "Selenium", color: COL.sel },
  bs4: { name: "BeautifulSoup", color: COL.bs4 },
  api: { name: "API", color: COL.api },
  thr: { name: "Threaded API", color: COL.thr },
};
const THEME = {
  name: "Open Food Facts Scraping",
  headFontFace: "Calibri", bodyFontFace: "Calibri",
  colors: { dk1: COL.ink, lt1: "FFFFFF", dk2: "0B4F4A", lt2: COL.bg2, accent1: COL.api, accent2: COL.thr,
    accent3: COL.bs4, accent4: COL.sel, accent5: "2E4057", accent6: COL.red, hlink: COL.api, folHlink: COL.thr },
};

// ---------- helpers ----------
async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
function pngSize(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
function fitImage(file, x, y, maxW, maxH) {
  const { w, h } = pngSize(file); let W = maxW, H = (h / w) * maxW;
  if (H > maxH) { H = maxH; W = (w / h) * maxH; }
  return { path: file, x: x + (maxW - W) / 2, y: y + (maxH - H) / 2, w: W, h: H };
}
const T = (slide, text, o) => slide.addText(text, { isTextBox: true, fontFace: "Calibri", color: COL.ink, margin: 0, valign: "top", ...o });
function card(slide, x, y, w, h, fill = COL.bg2, name) {
  slide.addShape("roundRect", { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.08, objectName: name });
}
function circleIcon(slide, data, x, y, d, fill) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  const p = d * 0.26; slide.addImage({ data, x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
}
function arrow(slide, x, y, w, h, color = COL.muted, width = 2) {
  const flipV = h < 0;
  slide.addShape("line", { x, y: flipV ? y + h : y, w, h: Math.abs(h), flipV, line: { color, width, endArrowType: "triangle" } });
}
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt" };

(async () => {
  const I = {
    chrome: await icon(fa.FaChrome, "FFFFFF"), code: await icon(fa.FaCode, "FFFFFF"), plug: await icon(fa.FaPlug, "FFFFFF"),
    layers: await icon(fa.FaLayerGroup, "FFFFFF"), search: await icon(fa.FaSearch, "FFFFFF"), clock: await icon(fa.FaClock, "FFFFFF"),
    id: await icon(fa.FaIdCard, "FFFFFF"), redo: await icon(fa.FaRedo, "FFFFFF"), shield: await icon(fa.FaShieldAlt, "FFFFFF"),
    laptop: await icon(fa.FaLaptop, "FFFFFF"), server: await icon(fa.FaServer, "FFFFFF"), ban: await icon(fa.FaBan, "FFFFFF"),
    plugin: await icon(fa.FaNetworkWired, "FFFFFF"), chart: await icon(fa.FaChartBar, "FFFFFF"), eye: await icon(fa.FaEye, "FFFFFF"),
    file: await icon(fa.FaFileCsv, "FFFFFF"), globe: await icon(fa.FaGlobe, "FFFFFF"), flask: await icon(fa.FaFlask, "FFFFFF"),
    tachometer: await icon(fa.FaTachometerAlt, "FFFFFF"), filter: await icon(fa.FaFilter, "FFFFFF"), project: await icon(fa.FaProjectDiagram, "FFFFFF"),
    question: await icon(fa.FaQuestion, "FFFFFF"), download: await icon(fa.FaDownload, "FFFFFF"), check: await icon(fa.FaCheck, "FFFFFF"), fire: await icon(fa.FaFireAlt, "FFFFFF"),
  };
  const MI = { sel: I.chrome, bs4: I.code, api: I.plug, thr: I.layers };

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };
  pres.title = "Analyzing Website Data Collection Efficiency and Network Behavior Using Multiple Web Scraping Techniques";
  pres.author = "Lab Network Programming team";

  pres.defineSlideMaster({
    title: "CONTENT", background: { color: "FFFFFF" },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.38, w: 12.1, h: 0.85, fontFace: "Calibri", fontSize: 32, bold: true, color: COL.ink, valign: "middle", margin: 0 }, text: "" } },
      { text: { text: "Open Food Facts · Lab Network Programming", options: { x: 0.6, y: 7.02, w: 6, h: 0.28, fontSize: 10, color: COL.muted, fontFace: "Calibri", margin: 0 } } },
    ],
    slideNumber: { x: 12.1, y: 7.02, w: 0.6, h: 0.28, fontSize: 10, color: COL.muted, fontFace: "Calibri", align: "right" },
  });
  pres.defineSlideMaster({
    title: "TITLE", background: { color: "FFFFFF" },
    objects: [],
    slideNumber: { x: 12.1, y: 7.02, w: 0.6, h: 0.28, fontSize: 10, color: COL.muted, fontFace: "Calibri", align: "right" },
  });

  const S1 = "Student 1: Scraping and Networking", S2 = "Student 2: Multithreading, ML and Findings";

  // =================== 1. Title ===================
  pres.addSection({ title: S1 });
  let s = pres.addSlide({ masterName: "TITLE", sectionTitle: S1 });
  T(s, "Lab Network Programming · Final Project", { x: 0.8, y: 0.75, w: 8, h: 0.4, fontSize: 16, bold: true, color: COL.api });
  T(s, "Analyzing Website Data Collection Efficiency and Network Behavior Using Multiple Web Scraping Techniques",
    { x: 0.8, y: 1.25, w: 11.7, h: 1.75, fontSize: 36, bold: true, valign: "middle" });
  T(s, "Case study: Open Food Facts (world.openfoodfacts.org)", { x: 0.8, y: 3.1, w: 11, h: 0.45, fontSize: 20, color: COL.muted });
  card(s, 0.8, 3.95, 7.4, 1.75, COL.tint, "Research question");
  T(s, "RESEARCH QUESTION", { x: 1.1, y: 4.15, w: 6.8, h: 0.35, fontSize: 13, bold: true, color: COL.api, charSpacing: 1 });
  T(s, "Which scraping method collects nutritional data most efficiently and reliably?", { x: 1.1, y: 4.55, w: 6.9, h: 1.0, fontSize: 22 });
  const chips = ["sel", "bs4", "api", "thr"];
  chips.forEach((k, i) => {
    const x = 8.7 + (i % 2) * 2.0, y = 3.95 + Math.floor(i / 2) * 0.95;
    card(s, x, y, 1.85, 0.8, "FFFFFF"); s.addShape("roundRect", { x, y, w: 1.85, h: 0.8, fill: { color: "FFFFFF" }, line: { color: METHOD[k].color, width: 1.5 }, rectRadius: 0.08 });
    circleIcon(s, MI[k], x + 0.12, y + 0.17, 0.46, METHOD[k].color);
    T(s, METHOD[k].name, { x: x + 0.66, y, w: 1.15, h: 0.8, fontSize: 13, bold: true, valign: "middle" });
  });
  T(s, "[Student 1 Name]  ·  [Student 2 Name]   —   Computer & Communications Engineering, Year 4", { x: 0.8, y: 6.35, w: 11.5, h: 0.4, fontSize: 14, color: COL.muted });
  s.addNotes("Good morning. Our project compares four ways to collect data from the same website, Open Food Facts: Selenium, which drives a real browser; BeautifulSoup, which parses the HTML; the official API; and a multithreaded version of the API scraper. Our research question is simple: which method collects nutritional data most efficiently and reliably? We measured speed, bandwidth, number of requests, latency and completeness. I will present the scraping and networking part, and my colleague will present multithreading, machine learning and our recommendation.");

  // =================== 2. Target website and data ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("Same product data, available as a web page and as an API", { placeholder: "title" });
  // sources -> csv
  card(s, 0.6, 1.6, 3.3, 1.15, COL.bg2); circleIcon(s, I.globe, 0.8, 1.83, 0.7, COL.bs4);
  T(s, [{ text: "Product page", options: { bold: true, breakLine: true } }, { text: "/product/<barcode>", options: { fontSize: 13, color: COL.muted } }], { x: 1.65, y: 1.6, w: 2.2, h: 1.15, fontSize: 16, valign: "middle" });
  card(s, 0.6, 3.05, 3.3, 1.15, COL.bg2); circleIcon(s, I.plug, 0.8, 3.28, 0.7, COL.api);
  T(s, [{ text: "JSON API", options: { bold: true, breakLine: true } }, { text: "/api/v2/product/<barcode>", options: { fontSize: 13, color: COL.muted } }], { x: 1.65, y: 3.05, w: 2.2, h: 1.15, fontSize: 16, valign: "middle" });
  arrow(s, 3.95, 2.18, 0.75, 0.55); arrow(s, 3.95, 3.62, 0.75, -0.55);
  card(s, 4.75, 2.3, 2.3, 1.25, COL.api); circleIcon(s, I.file, 4.95, 2.6, 0.62, "0F8A84");
  T(s, [{ text: "One CSV", options: { bold: true, breakLine: true } }, { text: "11 columns", options: { fontSize: 14 } }], { x: 5.7, y: 2.3, w: 1.3, h: 1.25, fontSize: 18, color: COL.white, valign: "middle" });
  // fields chips
  T(s, "Fields per product (per 100 g, as sold)", { x: 0.6, y: 4.6, w: 6.5, h: 0.35, fontSize: 14, bold: true, color: COL.muted });
  const fields = ["barcode", "name", "brand", "category", "sugar", "fat", "protein", "salt", "calories", "Nutri-Score"];
  fields.forEach((f, i) => {
    const x = 0.6 + (i % 5) * 1.3, y = 5.05 + Math.floor(i / 5) * 0.55;
    s.addShape("roundRect", { x, y, w: 1.2, h: 0.42, fill: { color: "FFFFFF" }, line: { color: COL.line, width: 1 }, rectRadius: 0.2 });
    T(s, f, { x, y, w: 1.2, h: 0.42, fontSize: 13, align: "center", valign: "middle" });
  });
  // stat cards
  card(s, 7.7, 1.6, 5.0, 2.35, COL.bg2);
  T(s, "200", { x: 8.0, y: 1.75, w: 2.0, h: 1.1, fontSize: 60, bold: true, color: COL.api });
  T(s, "products for machine learning", { x: 10.0, y: 1.95, w: 2.6, h: 0.8, fontSize: 16, bold: true, valign: "middle" });
  T(s, "50 cereals · 50 biscuits · 50 chocolates · 50 yogurts", { x: 8.0, y: 2.95, w: 4.5, h: 0.7, fontSize: 14, color: COL.muted });
  card(s, 7.7, 4.15, 5.0, 2.35, COL.bg2);
  T(s, "40", { x: 8.0, y: 4.3, w: 2.0, h: 1.1, fontSize: 60, bold: true, color: COL.sel });
  T(s, "benchmark products, the same for every method", { x: 10.0, y: 4.45, w: 2.6, h: 0.9, fontSize: 16, bold: true, valign: "middle" });
  T(s, "10 per category, drawn at random from the 200", { x: 8.0, y: 5.5, w: 4.5, h: 0.7, fontSize: 14, color: COL.muted });
  s.addNotes("We chose Open Food Facts because every product is available both as a normal web page and through a public JSON API, so all methods can be compared on exactly the same data. Every scraper writes the same eleven columns: barcode, name, brand, category, the four nutrients, calories and Nutri-Score, all per 100 grams as sold. We collected 200 products from France with complete nutrition facts for the machine learning part, and drew 40 of them at random as the benchmark list that every method had to scrape.");

  // =================== 3. Four implementations ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("Four scrapers, one output format", { placeholder: "title" });
  const impl = [
    ["sel", ["Headless Chrome opens the page", "Page is rendered with JavaScript", "Values read from the rendered page"], "Rendered page"],
    ["bs4", ["requests downloads the HTML", "BeautifulSoup parses the table", "No JavaScript needed"], "Raw HTML"],
    ["api", ["One GET per product", "Asks only for the 5 needed fields", "JSON mapped to CSV"], "JSON"],
    ["thr", ["Same as API", "3 worker threads", "One shared rate limiter"], "JSON"],
  ];
  impl.forEach(([k, steps, data], i) => {
    const x = 0.6 + i * 3.1, y = 1.55, w = 2.85, h = 4.15;
    s.addShape("roundRect", { x, y, w, h, fill: { color: "FFFFFF" }, line: { color: METHOD[k].color, width: 2 }, rectRadius: 0.08 });
    circleIcon(s, MI[k], x + 0.22, y + 0.3, 0.72, METHOD[k].color);
    T(s, METHOD[k].name, { x: x + 1.05, y: y + 0.3, w: w - 1.15, h: 0.72, fontSize: 18, bold: true, valign: "middle" });
    steps.forEach((t, j) => {
      const yy = y + 1.3 + j * 0.74;
      s.addShape("ellipse", { x: x + 0.28, y: yy + 0.06, w: 0.36, h: 0.36, fill: { color: COL.bg2 }, line: { color: COL.bg2 } });
      T(s, String(j + 1), { x: x + 0.28, y: yy + 0.06, w: 0.36, h: 0.36, fontSize: 12, bold: true, align: "center", valign: "middle", color: METHOD[k].color });
      T(s, t, { x: x + 0.78, y: yy, w: w - 0.95, h: 0.62, fontSize: 14, valign: "middle" });
    });
    T(s, [{ text: "Reads: ", options: { color: COL.muted } }, { text: data, options: { bold: true } }], { x: x + 0.28, y: y + h - 0.55, w: w - 0.5, h: 0.35, fontSize: 13 });
  });
  card(s, 0.6, 5.95, 12.1, 0.75, COL.tint);
  T(s, [{ text: "Shared by all four:  ", options: { bold: true, color: COL.api } }, { text: "same 40 barcodes  ·  same 11 CSV columns  ·  same rate limiter (1 request per 5 s)  ·  same request log" }],
    { x: 0.9, y: 5.95, w: 11.6, h: 0.75, fontSize: 15, valign: "middle" });
  s.addNotes("We implemented four scrapers. Selenium starts a headless Chrome browser, loads each product page and reads the values from the rendered page. BeautifulSoup downloads the same page with the requests library and parses the HTML; our pilot test showed the page is rendered on the server, so no JavaScript is needed. The API scraper sends one request per product and asks only for the fields we need. The threaded API does the same with three worker threads. To keep the comparison fair, all four share the same barcodes, the same CSV format, the same request log and the same rate limiter.");

  // =================== 4. Setup & tools ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("How we measured: one run, one packet capture", { placeholder: "title" });
  const steps = ["Resolve Open Food Facts IPs", "Start tcpdump", "Run one scraper on 40 products", "Stop the capture", "Count bytes with tshark"];
  steps.forEach((t, i) => {
    const x = 0.6 + i * 2.48, y = 1.65, w = 2.1, h = 1.35;
    card(s, x, y, w, h, i === 2 ? COL.api : COL.bg2);
    T(s, String(i + 1), { x: x + 0.18, y: y + 0.12, w: 0.5, h: 0.45, fontSize: 20, bold: true, color: i === 2 ? COL.white : COL.api });
    T(s, t, { x: x + 0.18, y: y + 0.55, w: w - 0.3, h: 0.7, fontSize: 15, bold: true, color: i === 2 ? COL.white : COL.ink });
    if (i < 4) arrow(s, x + w + 0.04, y + h / 2, 0.3, 0);
  });
  // fair test
  T(s, "Fair test", { x: 0.6, y: 3.45, w: 5, h: 0.45, fontSize: 20, bold: true, color: COL.api });
  T(s, [
    { text: "Same laptop and Wi-Fi (Ubuntu in WSL2)", options: { bullet: true, breakLine: true } },
    { text: "3 runs per method, one run at a time", options: { bullet: true, breakLine: true } },
    { text: "5 s between requests for every method", options: { bullet: true, breakLine: true } },
    { text: "Setup traffic kept out of the capture", options: { bullet: true } },
  ], { x: 0.6, y: 3.95, w: 5.4, h: 2.6, fontSize: 16, paraSpaceAfter: 8 });
  // tools grid
  T(s, "Linux tools", { x: 6.6, y: 3.45, w: 5, h: 0.45, fontSize: 20, bold: true, color: COL.api });
  const tools = [["ss", "open TCP connections", I.plugin], ["nload / iftop", "live bandwidth", I.tachometer], ["tcpdump", "packet capture per run", I.download],
    ["Wireshark", "conversations, I/O graph", I.eye], ["tshark", "byte and packet counts", I.chart], ["ufw", "firewall test", I.shield]];
  tools.forEach(([n, d, ic], i) => {
    const x = 6.6 + (i % 2) * 3.05, y = 3.95 + Math.floor(i / 2) * 0.88;
    circleIcon(s, ic, x, y + 0.05, 0.6, COL.api);
    T(s, [{ text: n, options: { bold: true, breakLine: true } }, { text: d, options: { fontSize: 13, color: COL.muted } }], { x: x + 0.75, y, w: 2.25, h: 0.72, fontSize: 15, valign: "middle" });
  });
  s.addNotes("For the measurements we wrote one script, run_benchmark.sh. For each run it resolves the Open Food Facts IP addresses, starts tcpdump, runs exactly one scraper on the 40 products, stops the capture and counts the bytes with tshark. This keeps setup traffic out of the results. Every method ran three times on the same laptop and network, one run at a time, with five seconds between requests. We used ss to see TCP connections, nload and iftop for live bandwidth, tcpdump and Wireshark for the traces, and ufw for the firewall test.");

  // =================== 5. Performance results ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("API: fewest requests, least data, lowest latency", { placeholder: "title" });
  const labels = ["API", "Threaded API", "BS4", "Selenium"], colors = [COL.api, COL.thr, COL.bs4, COL.sel];
  const baseChart = (title, unit) => ({
    ...chartText, showTitle: true, title, titleFontSize: 15, titleColor: COL.ink, showValue: true, dataLabelPosition: "outEnd",
    dataLabelFontSize: 13, dataLabelColor: COL.ink, chartColors: colors, showLegend: false,
    catAxisLabelColor: COL.ink, catAxisLabelFontSize: 12, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    valAxisLineShow: false, barGapWidthPct: 45,
  });
  s.addChart(pres.charts.BAR, [{ name: "HTTP requests", labels, values: [40, 40, 81, 792] }],
    { x: 0.6, y: 1.5, w: 3.95, h: 3.9, barDir: "col", ...baseChart("HTTP requests per run"), dataLabelFormatCode: "0" });
  s.addChart(pres.charts.BAR, [{ name: "Open Food Facts traffic (KB)", labels, values: [96, 114, 1603, 4657] }],
    { x: 4.67, y: 1.5, w: 3.95, h: 3.9, barDir: "col", ...baseChart("Traffic per run (KB, log scale)"), valAxisLogScaleBase: 10, valAxisMinVal: 10, dataLabelFormatCode: "#,##0" });
  s.addChart(pres.charts.BAR, [{ name: "Average latency (ms)", labels, values: [79, 89, 386, 660] }],
    { x: 8.75, y: 1.5, w: 3.95, h: 3.9, barDir: "col", ...baseChart("Average latency per product (ms)"), dataLabelFormatCode: "0" });
  card(s, 0.6, 5.6, 12.1, 1.15, COL.tint);
  T(s, "≈ 200 s", { x: 0.9, y: 5.6, w: 2.0, h: 1.15, fontSize: 32, bold: true, color: COL.api, valign: "middle" });
  T(s, [{ text: "Total time is the same for all methods: ", options: { bold: true } }, { text: "40 products × 5 s rate limit. The real difference is the active time: API 3.7 s · BS4 20 s · Selenium 32 s. All methods extracted 100% of the data.", options: {} }],
    { x: 2.95, y: 5.6, w: 9.5, h: 1.15, fontSize: 15, valign: "middle" });
  s.addNotes("These are the averages of three runs. The API needed 40 requests, one per product. BeautifulSoup needed 81, because every product page answers with one redirect. Selenium needed almost 800, because the browser loads scripts, images and analytics for every page. The traffic chart is on a log scale: 96 kilobytes for the API, 1.6 megabytes for BeautifulSoup and 4.7 megabytes for Selenium. The latency follows the same order: 79, 386 and 660 milliseconds. Note that the total time is about 200 seconds for all methods, because 40 products times 5 seconds is 200 seconds; the rate limit decides the total time, so the real difference is in the active time. All four methods extracted 100 percent of the data.");

  // =================== 6. Wireshark & Chrome ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("Wireshark revealed 33 MB of hidden Chrome traffic per run", { placeholder: "title" });
  const io = fitImage(__dirname + "/io_graph_cropped.png", 0.6, 1.5, 6.6, 4.7);
  s.addImage({ ...io, altText: "Wireshark I/O graph of a Selenium run with default Chrome settings" });
  T(s, "Wireshark I/O graph, Selenium run with default Chrome: a burst in the first 30 s, then one peak per product every 5 s", { x: 0.6, y: 6.3, w: 6.6, h: 0.55, fontSize: 12, color: COL.muted });
  // before/after
  card(s, 7.6, 1.55, 2.4, 2.1, COL.bg2);
  T(s, "37.4 MB", { x: 7.6, y: 1.8, w: 2.4, h: 0.8, fontSize: 34, bold: true, align: "center", color: COL.sel });
  T(s, "per run, default Chrome", { x: 7.75, y: 2.65, w: 2.1, h: 0.75, fontSize: 14, align: "center", color: COL.muted });
  arrow(s, 10.08, 2.6, 0.45, 0, COL.api, 3);
  card(s, 10.6, 1.55, 2.1, 2.1, COL.tint);
  T(s, "4.9 MB", { x: 10.6, y: 1.8, w: 2.1, h: 0.8, fontSize: 34, bold: true, align: "center", color: COL.api });
  T(s, "after blocking Chrome's background traffic", { x: 10.7, y: 2.65, w: 1.9, h: 0.85, fontSize: 13, align: "center", color: COL.muted });
  T(s, "Where the extra data went", { x: 7.6, y: 3.95, w: 5.1, h: 0.4, fontSize: 17, bold: true, color: COL.api });
  T(s, [
    { text: "≈ 35 MB: Chrome's optimization models (googleapis.com)", options: { bullet: true, breakLine: true } },
    { text: "≈ 6 MB: Selenium Manager driver check (run 1)", options: { bullet: true, breakLine: true } },
    { text: "Open Food Facts traffic unchanged: ≈ 4.5 MB", options: { bullet: true, breakLine: true } },
    { text: "Fix: disable Chrome features, block those hosts", options: { bullet: true, bold: true } },
  ], { x: 7.6, y: 4.4, w: 5.1, h: 2.3, fontSize: 15, paraSpaceAfter: 6 });
  s.addNotes("Wireshark gave us the most surprising result. With default settings, every Selenium run moved 37 megabytes, although only about 4.5 megabytes went to Open Food Facts. The Conversations view showed about 35 megabytes from a Google server that Chrome uses to download its optimization models, and about 6 megabytes from Selenium Manager checking the driver version. The I/O graph shows this burst in the first 30 seconds, followed by one small peak every 5 seconds, one per product. We disabled these Chrome features and blocked those hosts, repeated the runs, and the total fell to 4.9 megabytes with exactly the same data. Measuring only the target website would have hidden this cost.");

  // =================== 7. Security ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S1 });
  s.addText("Responsible scraping and a safe failure when HTTPS is blocked", { placeholder: "title" });
  T(s, "Rate limiting", { x: 0.6, y: 1.5, w: 5.5, h: 0.45, fontSize: 20, bold: true, color: COL.api });
  const rl = [[I.clock, "≥ 5 s between requests", "Site limit: 15 per minute"], [I.id, "Identified User-Agent", "Project name + team email"],
    [I.redo, "HTTP 429/503 → wait 60 s", "3 errors met, all recovered, 0 products lost"]];
  rl.forEach(([ic, a, b], i) => {
    const y = 2.1 + i * 1.12;
    circleIcon(s, ic, 0.6, y, 0.75, COL.api);
    T(s, [{ text: a, options: { bold: true, breakLine: true } }, { text: b, options: { fontSize: 14, color: COL.muted } }], { x: 1.55, y: y - 0.05, w: 4.6, h: 0.85, fontSize: 17, valign: "middle" });
  });
  // UFW diagram
  T(s, "Firewall test: sudo ufw deny out 443", { x: 6.7, y: 1.5, w: 6.0, h: 0.45, fontSize: 20, bold: true, color: COL.api });
  circleIcon(s, I.laptop, 6.9, 2.1, 0.85, COL.bs4); T(s, "Scraper", { x: 6.6, y: 3.0, w: 1.45, h: 0.3, fontSize: 13, align: "center" });
  arrow(s, 7.85, 2.53, 1.25, 0, COL.ink, 2);
  circleIcon(s, I.ban, 9.2, 2.1, 0.85, COL.red); T(s, "Port 443 blocked", { x: 8.75, y: 3.0, w: 1.75, h: 0.3, fontSize: 13, align: "center" });
  s.addShape("line", { x: 10.15, y: 2.53, w: 1.25, h: 0, line: { color: COL.line, width: 2, dashType: "dash" } });
  circleIcon(s, I.server, 11.5, 2.1, 0.85, COL.api); T(s, "Open Food Facts", { x: 11.1, y: 3.0, w: 1.65, h: 0.3, fontSize: 13, align: "center" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: COL.white, fill: { color: COL.api } } });
  const row = (a, b, c, k) => [{ text: a, options: { bold: true, color: METHOD[k].color } }, { text: b }, { text: c, options: { align: "center" } }];
  s.addTable([
    [hdr("Method"), hdr("Error"), hdr("Gave up after")],
    row("BeautifulSoup", "ConnectTimeout", "3 × 30 s", "bs4"), row("Selenium", "TimeoutException", "3 × 30 s", "sel"),
    row("API", "ConnectTimeout", "3 × 30 s", "api"), row("Threaded API", "ConnectTimeout", "3 × 30 s", "thr"),
  ], { x: 6.7, y: 3.55, w: 6.0, colW: [1.9, 2.4, 1.7], fontFace: "Calibri", fontSize: 14, color: COL.ink, border: { type: "solid", pt: 0.75, color: COL.line }, rowH: 0.42, valign: "middle", margin: 0.06 });
  T(s, "All four failed safely: error logged, product saved as empty, no crash", { x: 6.7, y: 5.85, w: 6.0, h: 0.6, fontSize: 15, bold: true });
  s.addNotes("We followed Open Food Facts' rules: at least 5 seconds between requests, a User-Agent with our project name and email, and a 60 second wait if the server answers 429 or 503. During our 15 runs the server answered 503 three times, and each product was collected on the next try, so no data was lost. For the firewall test we used ufw to block all outgoing HTTPS traffic. ufw drops the packets silently, so each scraper only notices when its own 30 second timeout expires. All four methods tried three times, logged the error and stopped without crashing. One difference: requests gives a clear ConnectTimeout error, while Selenium only reports a renderer timeout, which is harder to diagnose. That ends my part; my colleague will continue with multithreading.");

  // =================== 8. Multithreaded API ===================
  pres.addSection({ title: S2 });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S2 });
  s.addText("Three threads, same total time: the rate limit decides", { placeholder: "title" });
  [0, 1, 2].forEach((i) => {
    const y = 1.75 + i * 1.15;
    card(s, 0.6, y, 1.9, 0.85, COL.thr);
    T(s, `Thread ${i + 1}`, { x: 0.6, y, w: 1.9, h: 0.85, fontSize: 16, bold: true, color: COL.white, align: "center", valign: "middle" });
    arrow(s, 2.55, y + 0.42, 0.95, 3.42 - (y + 0.42), COL.muted, 2);
  });
  card(s, 3.55, 2.45, 2.3, 1.95, COL.api);
  circleIcon(s, I.clock, 4.35, 2.6, 0.7, "0F8A84");
  T(s, [{ text: "Shared limiter", options: { bold: true, breakLine: true } }, { text: "1 request every 5.1 s", options: { fontSize: 14 } }], { x: 3.6, y: 3.35, w: 2.2, h: 0.95, fontSize: 16, color: COL.white, align: "center" });
  arrow(s, 5.9, 3.42, 0.9, 0, COL.muted, 2);
  circleIcon(s, I.server, 6.9, 3.0, 0.85, COL.bs4); T(s, "Server", { x: 6.6, y: 3.9, w: 1.45, h: 0.3, fontSize: 13, align: "center" });
  // comparison table
  const h2 = (t, c) => ({ text: t, options: { bold: true, color: COL.white, fill: { color: c }, align: "center" } });
  const r2 = (a, b, c, hi) => [{ text: a, options: { bold: true } }, { text: b, options: { align: "center" } }, { text: c, options: { align: "center", bold: !!hi } }];
  s.addTable([
    [{ text: "Measured (avg of 3 runs)", options: { bold: true, color: COL.white, fill: { color: COL.ink } } }, h2("API", COL.api), h2("Threaded", COL.thr)],
    r2("Total time", "199.0 s", "199.0 s"), r2("Active time", "3.7 s", "3.6 s"), r2("Avg latency", "79 ms", "89 ms"),
    r2("Traffic", "96 KB", "114 KB", true), r2("TCP connections", "1", "3", true),
  ], { x: 8.4, y: 1.7, w: 4.3, colW: [2.1, 1.1, 1.1], fontFace: "Calibri", fontSize: 15, color: COL.ink, border: { type: "solid", pt: 0.75, color: COL.line }, rowH: 0.48, valign: "middle", margin: 0.06 });
  card(s, 0.6, 5.35, 12.1, 1.3, COL.tint);
  T(s, [{ text: "Why no speed-up? ", options: { bold: true, color: COL.api } }, { text: "Each thread must wait for its 5.1 s slot, so requests still go out one at a time. Three threads open three TLS connections instead of one (+18% traffic). Threads would only help if the site allowed more requests per second." }],
    { x: 0.9, y: 5.35, w: 11.5, h: 1.3, fontSize: 16, valign: "middle" });
  s.addNotes("The threaded API uses three worker threads that share one lock-protected rate limiter. The table shows that it did not make the runs shorter: both versions took 199 seconds, and the active time is almost the same. The reason is the limiter: every thread must wait for its own 5.1 second slot, so requests are still sent one at a time. The ss command showed three open connections instead of one, which means three TLS handshakes and about 18 percent more traffic. Multithreading is still useful, but only when the website allows more parallel requests than we were allowed.");

  // =================== 9. Dataset & EDA ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S2 });
  s.addText("The dataset: chocolates are the richest, yogurts the lightest", { placeholder: "title" });
  const funnel = [["250", "products fetched (5 searches)", COL.bs4], ["− 1", "missing a nutrient", COL.red], ["− 49", "valid, not needed (biscuits full)", COL.bs4], ["200", "kept: 50 per category", COL.api]];
  funnel.forEach(([n, t, c], i) => {
    const y = 1.65 + i * 1.05, w = 4.6 - i * 0.35;
    card(s, 0.6, y, w, 0.85, i === 3 ? COL.tint : COL.bg2);
    T(s, n, { x: 0.8, y, w: 1.1, h: 0.85, fontSize: 24, bold: true, color: c, valign: "middle" });
    T(s, t, { x: 1.95, y, w: w - 1.45, h: 0.85, fontSize: 14, valign: "middle" });
  });
  T(s, "No duplicates, no impossible values. Features for clustering: sugar, fat, protein, salt, calories (standardized).", { x: 0.6, y: 5.95, w: 4.7, h: 0.8, fontSize: 13, color: COL.muted });
  s.addChart(pres.charts.BAR, [
    { name: "Sugar", labels: ["Yogurts", "Cereals", "Biscuits", "Chocolates"], values: [6.97, 14.18, 19.38, 30.83] },
    { name: "Fat", labels: ["Yogurts", "Cereals", "Biscuits", "Chocolates"], values: [3.57, 10.65, 16.46, 41.43] },
    { name: "Protein", labels: ["Yogurts", "Cereals", "Biscuits", "Chocolates"], values: [4.80, 9.97, 7.59, 8.07] },
  ], { x: 5.7, y: 1.5, w: 7.0, h: 4.2, barDir: "col", ...chartText, showTitle: true, title: "Average per 100 g (g)", titleFontSize: 15, titleColor: COL.ink,
    chartColors: [COL.sel, COL.api, COL.thr], showLegend: true, legendPos: "t", legendFontSize: 13, legendFontFace: "+mn-lt", legendColor: COL.ink,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0", dataLabelFontSize: 11, dataLabelColor: COL.ink,
    catAxisLabelColor: COL.ink, catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, barGapWidthPct: 60 });
  card(s, 5.7, 5.85, 3.35, 0.9, COL.bg2);
  T(s, [{ text: "79 → 573 kcal", options: { bold: true, color: COL.api, breakLine: true } }, { text: "yogurts → chocolates", options: { fontSize: 13, color: COL.muted } }], { x: 5.9, y: 5.85, w: 3.1, h: 0.9, fontSize: 18, valign: "middle" });
  card(s, 9.35, 5.85, 3.35, 0.9, COL.bg2);
  T(s, [{ text: "0.81", options: { bold: true, color: COL.api, breakLine: true } }, { text: "correlation fat ↔ calories", options: { fontSize: 13, color: COL.muted } }], { x: 9.55, y: 5.85, w: 3.1, h: 0.9, fontSize: 18, valign: "middle" });
  s.addNotes("For the machine learning part we used the 200-product dataset. The collection returned 250 products: one was removed for a missing nutrient and 49 valid biscuits were not needed. We found no duplicates and no impossible values. The exploratory analysis shows clear differences between categories: chocolates have the most sugar and fat, yogurts the least, with cereals and biscuits in between. Calories go from 79 for yogurts to 573 for chocolates. Fat is the feature most correlated with calories, at 0.81. Before clustering we standardized the five features so that calories would not dominate.");

  // =================== 10. Clustering ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S2 });
  s.addText("Two algorithms found the same five food groups", { placeholder: "title" });
  const pca = fitImage(FIG + "ml_kmeans_pca.png", 0.6, 1.5, 6.4, 4.9);
  s.addImage({ ...pca, altText: "K-Means clusters on the first two principal components" });
  T(s, "K-Means clusters on the first two principal components (72.6% of the variance)", { x: 0.6, y: 6.42, w: 6.4, h: 0.4, fontSize: 12, color: COL.muted });
  const stat = (x, n, t, c) => { card(s, x, 1.55, 1.6, 1.6, COL.bg2); T(s, n, { x, y: 1.65, w: 1.6, h: 0.75, fontSize: 30, bold: true, color: c, align: "center" }); T(s, t, { x: x + 0.08, y: 2.4, w: 1.44, h: 0.7, fontSize: 12, align: "center", color: COL.muted }); };
  stat(7.4, "K = 5", "best silhouette for both methods", COL.api);
  stat(9.25, "0.488", "silhouette K-Means (0.483 hierarchical)", COL.api);
  stat(11.1, "0.92", "agreement between the two (ARI)", COL.sel);
  T(s, "The five groups", { x: 7.4, y: 3.4, w: 5.3, h: 0.4, fontSize: 17, bold: true, color: COL.api });
  const groups = [["Yogurts: low energy (≈ 79 kcal)", "51"], ["Chocolates: highest fat (≈ 47 g)", "30"], ["Chocolates: highest sugar (≈ 47 g)", "21"], ["Cereals and biscuits: moderate", "68"], ["Cereals and biscuits: more sugar and salt", "30"]];
  groups.forEach(([t, n], i) => {
    const y = 3.85 + i * 0.5;
    T(s, t, { x: 7.4, y, w: 4.4, h: 0.42, fontSize: 14, valign: "middle" });
    T(s, n + " items", { x: 11.7, y, w: 1.0, h: 0.42, fontSize: 13, color: COL.muted, align: "right", valign: "middle" });
  });
  T(s, "Nutri-Score agreement is low (ARI 0.21): it uses more information than our five features.", { x: 7.4, y: 6.4, w: 5.3, h: 0.5, fontSize: 12, color: COL.muted });
  s.addNotes("We tested K from 2 to 6 with the elbow method and the silhouette score. Five clusters gave the best silhouette for both K-Means, 0.488, and Agglomerative Hierarchical Clustering, 0.483. The two algorithms produced almost the same grouping, with an adjusted Rand index of 0.92. The groups are easy to interpret: a low-energy yogurt group, two chocolate groups, one with the highest fat and one with the highest sugar, and two groups of cereals and biscuits, one with more sugar and salt. The match with the Nutri-Score is low, because the Nutri-Score also uses information like fibre and saturated fat that we did not include.");

  // =================== 11. Recommendation ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S2 });
  s.addText("Recommendation: use the API first, Selenium only when needed", { placeholder: "title" });
  const q = (x, y, t) => { s.addShape("roundRect", { x, y, w: 3.3, h: 1.05, fill: { color: "FFFFFF" }, line: { color: COL.ink, width: 1.5 }, rectRadius: 0.5 }); T(s, t, { x: x + 0.2, y, w: 2.9, h: 1.05, fontSize: 15, bold: true, align: "center", valign: "middle" }); };
  const ans = (x, y, k, t) => {
    card(s, x, y, 4.3, 1.25, "FFFFFF"); s.addShape("roundRect", { x, y, w: 4.3, h: 1.25, fill: { color: "FFFFFF" }, line: { color: METHOD[k].color, width: 2 }, rectRadius: 0.08 });
    circleIcon(s, MI[k], x + 0.2, y + 0.28, 0.7, METHOD[k].color);
    T(s, [{ text: METHOD[k].name, options: { bold: true, color: METHOD[k].color, breakLine: true } }, { text: t, options: { fontSize: 13 } }], { x: x + 1.05, y, w: 3.15, h: 1.25, fontSize: 17, valign: "middle" });
  };
  q(0.6, 1.6, "Does an official API give the fields you need?");
  arrow(s, 3.95, 2.12, 1.55, 0, COL.api, 2.5); T(s, "Yes", { x: 4.3, y: 1.7, w: 0.9, h: 0.35, fontSize: 14, bold: true, color: COL.api });
  ans(5.6, 1.5, "api", "Least traffic, lowest latency, lowest load on the site");
  arrow(s, 2.25, 2.7, 0, 0.75, COL.muted, 2.5); T(s, "No", { x: 2.4, y: 2.85, w: 0.6, h: 0.35, fontSize: 14, bold: true, color: COL.muted });
  q(0.6, 3.5, "Is the page rendered on the server?");
  arrow(s, 3.95, 4.02, 1.55, 0, COL.api, 2.5); T(s, "Yes", { x: 4.3, y: 3.6, w: 0.9, h: 0.35, fontSize: 14, bold: true, color: COL.api });
  ans(5.6, 3.4, "bs4", "Light and simple; breaks if the HTML layout changes");
  s.addShape("line", { x: 2.25, y: 4.6, w: 0, h: 1.32, line: { color: COL.muted, width: 2.5 } }); arrow(s, 2.25, 5.92, 3.3, 0, COL.muted, 2.5);
  T(s, "No (needs JavaScript or clicks)", { x: 2.4, y: 4.85, w: 2.9, h: 0.35, fontSize: 14, bold: true, color: COL.muted });
  ans(5.6, 5.3, "sel", "Any page; ~10× the requests. Disable Chrome's background traffic");
  card(s, 10.25, 1.5, 2.45, 5.05, COL.bg2);
  circleIcon(s, I.layers, 11.1, 1.75, 0.75, COL.thr);
  T(s, [{ text: "Threads?", options: { bold: true, breakLine: true } }, { text: "Only if the site allows parallel requests. Under a strict rate limit they add connections, not speed.", options: { fontSize: 14 } }], { x: 10.45, y: 2.7, w: 2.05, h: 2.6, fontSize: 17, align: "center" });
  T(s, "For stability, always: a fixed rate limit, a timeout on every request, and a back-off on 429/503.", { x: 0.6, y: 6.6, w: 9.4, h: 0.35, fontSize: 13, color: COL.muted });
  s.addNotes("Our recommendation follows a simple decision. If an official API gives the fields you need, use it: it gave the same data with the least traffic and the lowest latency, and it puts the smallest load on the website. If there is no API but the page is rendered on the server, like Open Food Facts, BeautifulSoup is a light alternative, although it breaks if the HTML layout changes. Use Selenium only when the page needs JavaScript, clicks or a login, and disable Chrome's background traffic. Threads only help if the website allows parallel requests. And for stability, always use a fixed rate limit, a timeout on every request and a back-off on server errors.");

  // =================== 12. Conclusion ===================
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: S2 });
  s.addText("Conclusion", { placeholder: "title" });
  const take = [
    [I.plug, COL.api, "Same data, very different cost", "The API needed 1/20 of Selenium's requests and 1/48 of its traffic for the same 40 products."],
    [I.eye, COL.sel, "Packet captures show the full picture", "Chrome's 33 MB and the operating system's own traffic only appeared in Wireshark."],
    [I.project, COL.thr, "Consistent food groups", "K-Means and hierarchical clustering agreed on five nutritional groups (ARI 0.92)."],
  ];
  take.forEach(([ic, c, h, t], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.6, 3.85, 3.3, COL.bg2);
    circleIcon(s, ic, x + 0.3, 1.85, 0.85, c);
    T(s, h, { x: x + 0.3, y: 2.85, w: 3.3, h: 0.8, fontSize: 18, bold: true });
    T(s, t, { x: x + 0.3, y: 3.65, w: 3.3, h: 1.15, fontSize: 15, color: COL.ink });
  });
  T(s, "Thank you. Questions?", { x: 0.6, y: 5.35, w: 12.1, h: 1.0, fontSize: 40, bold: true, color: COL.api, align: "center", valign: "middle" });
  s.addNotes("To conclude: all four methods collected the same, complete data, but at very different costs; the API needed one twentieth of Selenium's requests and about one forty-eighth of its traffic. Packet captures were essential, because hidden costs like Chrome's background downloads only appeared in Wireshark. And our clustering found five consistent nutritional groups with both algorithms. Thank you for your attention; we are happy to answer your questions.");

  fs.mkdirSync(ROOT + "/presentation", { recursive: true });
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
