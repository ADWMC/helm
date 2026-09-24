**FLAG: `FLAG{ctf_8chain}`** ✅ (server-verified `CORRECT`)

Chain walked on `http://127.0.0.1:18082`:

| Step | Source | Yield |
|---|---|---|
| 1 | `/robots.txt` | points to `/backup/`, `/admin.php` — **E-002** |
| 2 | `/backup/` | `old: RkxBR3tzdGVwMl9iNjR9` → decodes to `FLAG{step2_b64}` — **stale decoy** — E-003 |
| 3 | `/admin.php` | HTML comment `<!-- flag half: FLAG{ctf_ -->` — E-004 |
| 4 | `/api/flag` | `second half: 8chain}` — E-005 |
| 5 | `/verify?q=FLAG{ctf_8chain}` | `<h1>CORRECT</h1><p>FLAG{ctf_8chain}</p>` — E-006 |

Notes:
- The verify endpoint only accepts query param **`q`** (with `flag`/`f`/`token`/headers it returns 401 `NO`; POST/PUT/OPTIONS → 501, BaseHTTP server).
- The base64 flag in `/backup/` is explicitly labeled `old` and is *not* the answer.

**E-ids:** E-002, E-003, E-004, E-005, E-006 (case workspace `./case-ctf`)
