# FINDINGS

## FLAG assembled and verified: FLAG{ctf_8chain}
Walk: robots.txt (E-002) -> /backup/ (E-003, contains stale base64 flag FLAG{step2_b64} = decoy) -> /admin.php comment half "FLAG{ctf_" (E-004) + /api/flag "8chain}" (E-005). Assembled flag FLAG{ctf_8chain} confirmed by GET /verify?q=FLAG{ctf_8chain} -> CORRECT (E-006).
evidence: E-002, E-003, E-004, E-005, E-006

