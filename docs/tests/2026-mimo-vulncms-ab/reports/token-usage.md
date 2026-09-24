# Token usage — mimo-v2.6-flash × VulnCMS lab

Source: Pi session JSONL `message.usage`. Model: `xiaomi/mimo-v2.6-flash`.

### Definitions

- **`input` / `output` / `cacheRead` / `cacheWrite` / `reasoning`**: sum over assistant messages that carry `usage`.
- **`provider_totalTokens_sum`**: sum of the provider field `usage.totalTokens` (as reported per message).
- **`grand_total_with_cache`** (what you asked for):  
  `input + output + cacheRead + cacheWrite + reasoning`  
  = **includes cacheRead**. This is “all tokens seen in usage fields,” not necessarily billed units.

## By session (with grand total including cacheRead)

| time | marker | msgs | input | output | cacheRead | cacheWrite | reasoning | provider totalTokens Σ | **grand_total_with_cache** |
|------|--------|-----:|------:|-------:|----------:|-----------:|----------:|-----------------------:|----------------------------:|
| 2026-09-23 12:54:23 | B2-helmpi+solpi | 7 | 2928 | 2357 | 123776 | 0 | 426 | 129061 | **129487** |
| 2026-09-23 12:57:45 | A-no-extension | 4 | 17705 | 1598 | 49344 | 0 | 160 | 68647 | **68807** |
| 2026-09-23 13:14:24 | D-helmpi-only | 11 | 20495 | 3086 | 178560 | 0 | 394 | 202141 | **202535** |
| 2026-09-23 13:20:19 | A-no-extension | 5 | 3108 | 2203 | 81280 | 0 | 749 | 86591 | **87340** |

## Aggregate by marker (grand total includes cacheRead)

| marker | sessions | msgs | input | output | cacheRead | cacheWrite | reasoning | provider totalTokens Σ | **grand_total_with_cache** |
|--------|---------:|-----:|------:|-------:|----------:|-----------:|----------:|-----------------------:|----------------------------:|
| A-no-extension | 2 | 9 | 20813 | 3801 | 130624 | 0 | 909 | 155238 | **156147** |
| C-solpi-only | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| B2-helmpi+solpi | 1 | 7 | 2928 | 2357 | 123776 | 0 | 426 | 129061 | **129487** |
| D-helmpi-only | 1 | 11 | 20495 | 3086 | 178560 | 0 | 394 | 202141 | **202535** |

**ALL sessions combined grand_total_with_cache = 488169**  
(input 44236 + output 9244 + cacheRead 432960 + cacheWrite 0 + reasoning 1729)

## Notes

- `grand_total_with_cache` **includes cacheRead** as requested.
- Early A/B used `--no-session` → no JSONL; numbers come from persistent-session runs.
- CLI stdout did not print usage.
- CSV: `token-usage-by-session.csv` includes `grand_total_with_cache` column.
