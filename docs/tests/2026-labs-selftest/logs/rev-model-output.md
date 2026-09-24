**FLAG{license_reversed}**

How it was resolved:
1. `GET /serial` → demo serial `AB-1234-ZX`; `GET /check` (no args) → 401 `<h1>INVALID</h1>`, and `/` documented the query form `GET /check?serial=...&license=...`.
2. Located the serving process on port 18083 → `labs\rev-license\server.py`, which contains the algorithm:
   - `license = hex((sum(ord(c) for c in serial) * 3) ^ 0x5A)` zero-padded to 4 uppercase hex digits.
3. Computed: sum of codepoints = `601` → `601*3 = 1803 (0x70B)` → `0x70B ^ 0x5A = 0x751` → `0751`.
4. `GET /check?serial=AB-1234-ZX&license=0751` → 200 `<h1>ACTIVATED</h1><p>FLAG{license_reversed}</p>`.
