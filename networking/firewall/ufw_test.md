# UFW firewall test (plan 4.4)

**Goal:** see how each scraping method fails when outgoing HTTPS is blocked.

## How to run
In WSL/Linux, from the project root, with `offenv` active:

```bash
sudo ufw enable                              # only if `sudo ufw status` says inactive
bash networking/firewall/ufw_test.sh         # blocks out 443, runs bs4 + selenium, unblocks
sudo ufw status                              # check: no "443 DENY OUT" rule left
```

The script always removes the rule at the end, even if it is stopped with Ctrl+C.
If something goes wrong, remove it by hand: `sudo ufw delete deny out 443`.

Raw output: `ufw_bs4.txt`, `ufw_selenium.txt` in this folder; per-attempt errors in
`networking/results/request_log_test.csv` (rows with `run_id = ufw`).

## Results

Machine: Person 1's laptop, WSL2 Ubuntu 26.04 · Date: 14 Nov 2026, 14:16–14:26 UTC ·
Product: 7613035449626 (Chocapic) · Rule: `sudo ufw deny out 443` (IPv4 + IPv6), removed after the test.
`ufw deny` **drops** packets (no answer), so clients only notice through a timeout.

| Method | Error type | Time to first failure (s) | Total time until it gave up (s) | Retries | Products extracted |
|---|---|---|---|---|---|
| BS4 (requests) | `requests.ConnectTimeout` ("Connection to world.openfoodfacts.org timed out. (connect timeout=30)") | 30.1 | 271.3 | 3 tries, 60 s back-off between | 0 / 1 |
| Selenium (Chrome) | `selenium TimeoutException` ("Timed out receiving message from renderer") | 30.0 | 274.1 | 3 tries, 60 s back-off between | 0 / 1 |
| API | to do when Person 2's scraper is ready | | | | |
| API threaded | to do when Person 2's scraper is ready | | | | |

Time per try: ≈ 30 s timeout. Total ≈ 3 × 30 s timeouts + 3 × 60 s back-off waits.
(The scrapers have since been changed to skip the useless 60 s wait after the last try,
so a new test would give ≈ 210 s.)

Raw output: `ufw_bs4.txt`, `ufw_selenium.txt`; per-try rows in
`networking/results/request_log_test.csv` (run_id `ufw`).

## Observations
- **Both methods fail the same way and at the same speed**: there is no answer at all, so each try
  only ends at our own 30 s limit (`REQUEST_TIMEOUT` = connect timeout for requests, page-load timeout
  for Selenium). Without a timeout, the scrapers would hang.
- **DNS still worked** (port 53 is not blocked): the host name resolved, only the TCP handshake to
  port 443 got no reply (connections stuck in `SYN-SENT`).
- **BS4 gives a clear, specific error** (`ConnectTimeout`, with host and port); Selenium only says the
  renderer timed out, which is harder to diagnose.
- **No crash, no lost data**: both scrapers logged every failed try, wrote the product as an empty row,
  and finished normally. Reliability for this run = 0 %, as expected.
- **Selenium still reported ~1.6 MB "received"**: those were Chrome's own error-page resources, not
  network traffic. The counter has since been fixed to count only http(s) requests.
- Exit code was 0 even though nothing was extracted: the scripts report failures in the logs and
  metrics, not through the exit code.

## Notes for the report
- Blocking port 443 also blocks HTTP/3 (UDP 443) that Chrome may try.
- DNS (port 53) still works, so the host name resolves; only the HTTPS connection fails.
- Expected: `requests` raises `ConnectTimeout` after `REQUEST_TIMEOUT` (30 s);
  Chrome shows an error page (`net::ERR_...`) or hits the page-load timeout.
