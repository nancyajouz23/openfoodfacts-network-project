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

## Results (fill in after the test)

Machine: ______ · Date: ______ · `ufw deny` = packets are **dropped** (no answer), so clients wait for a timeout.

| Method | Error type | Time to first failure (s) | Total time until it gave up (s) | Retries | Behaviour |
|---|---|---|---|---|---|
| BS4 (requests) | | | | 3 × with 60 s back-off | |
| Selenium (Chrome) | | | | 3 × with 60 s back-off | |
| API | | | | | |
| API threaded | | | | | |

## Observations
- 
- 

## Notes for the report
- Blocking port 443 also blocks HTTP/3 (UDP 443) that Chrome may try.
- DNS (port 53) still works, so the host name resolves; only the HTTPS connection fails.
- Expected: `requests` raises `ConnectTimeout` after `REQUEST_TIMEOUT` (30 s);
  Chrome shows an error page (`net::ERR_...`) or hits the page-load timeout.
