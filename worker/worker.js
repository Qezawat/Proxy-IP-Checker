// ============================================================
//  ProxyIP Checker Worker  (v2 — real TCP handshake check)
//  Deploy: Cloudflare Workers
//  Endpoint: /check?ip=1.2.3.4
//
//  Uses the `cloudflare:sockets` API to open a real TCP
//  connection to the candidate IP:port. This avoids the false
//  positives you get from a plain fetch(), which can succeed
//  even on IPs that don't actually proxy traffic.
//
//  Response:
//  {
//    "ip": "1.2.3.4",
//    "success": true,
//    "risk": 15,
//    "risk_level": "low",
//    "country": "US",
//    "org": "Cloudflare Inc",
//    "isp": "Cloudflare",
//    "proxy_flag": false,
//    "hosting": true,
//    "port": 443,
//    "latency_ms": 120,
//    "error": null
//  }
// ============================================================

import { connect } from "cloudflare:sockets";

const PROXY_PORT     = 443;
const SOCKET_TIMEOUT = 6000;   // ms
const IPAPI_TIMEOUT  = 5000;

// ── risk score calculator ───────────────────────────────────
function calcRisk(data) {
    let score = 0;
    if (data.proxy)   score += 40;
    if (data.hosting) score += 10;
    if (data.mobile)  score += 5;

    const combined = ((data.org || "") + " " + (data.isp || "")).toLowerCase();
    const badKeywords  = ["tor", "vpn", "anonymizer", "spam", "abuse", "botnet"];
    const goodKeywords = ["cloudflare", "amazon", "google", "microsoft", "akamai",
                          "fastly", "cdn", "digital ocean", "hetzner", "ovh",
                          "vultr", "linode", "oracle"];

    for (const kw of badKeywords)  { if (combined.includes(kw)) { score += 25; break; } }
    for (const kw of goodKeywords) { if (combined.includes(kw)) { score = Math.max(0, score - 10); break; } }

    return Math.min(100, Math.max(0, score));
}

function riskLevel(score) {
    if (score <= 10) return "low";
    if (score <= 40) return "medium";
    return "high";
}

// ── fetch IP info from ip-api.com ──────────────────────────
async function getIpInfo(ip) {
    const fields = "status,country,countryCode,city,org,isp,proxy,hosting,mobile,query";
    const url = `http://ip-api.com/json/${ip}?fields=${fields}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IPAPI_TIMEOUT);
    try {
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        clearTimeout(timer);
        return null;
    }
}

// ── real TCP proxy check via cloudflare:sockets ─────────────
// A working proxyIP must accept a real TCP connection on the
// target port. We use Cloudflare's raw socket API to test this
// directly, instead of fetch() which gives false positives.
async function checkProxyReal(ip, port) {
    const start = Date.now();
    let socket;

    try {
        socket = connect({ hostname: ip, port });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), SOCKET_TIMEOUT)
        );

        await Promise.race([socket.opened, timeoutPromise]);

        const latency = Date.now() - start;
        try { await socket.close(); } catch {}
        return { success: true, latency };

    } catch (e) {
        try { if (socket) await socket.close(); } catch {}
        return { success: false, latency: null, error: (e && e.message) ? e.message : "connection failed" };
    }
}

// ── CORS ─────────────────────────────────────────────────────
function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json",
    };
}

// ── main handler ───────────────────────────────────────────
async function handleRequest(request) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === "/check") {
        const ip = url.searchParams.get("ip")?.trim();

        if (!ip) {
            return new Response(JSON.stringify({ error: "Missing ?ip= parameter" }),
                { status: 400, headers: corsHeaders() });
        }
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            return new Response(JSON.stringify({ error: "Invalid IP format" }),
                { status: 400, headers: corsHeaders() });
        }

        const [ipInfo, proxyResult] = await Promise.all([
            getIpInfo(ip),
            checkProxyReal(ip, PROXY_PORT),
        ]);

        const risk  = ipInfo ? calcRisk(ipInfo) : 50;
        const level = riskLevel(risk);

        const result = {
            ip,
            success:     proxyResult.success,
            risk,
            risk_level:  level,
            country:     ipInfo?.countryCode ?? null,
            city:        ipInfo?.city        ?? null,
            org:         ipInfo?.org         ?? null,
            isp:         ipInfo?.isp         ?? null,
            proxy_flag:  ipInfo?.proxy       ?? null,
            hosting:     ipInfo?.hosting     ?? null,
            port:        PROXY_PORT,
            latency_ms:  proxyResult.latency ?? null,
            error:       proxyResult.success ? null : (proxyResult.error ?? "connection failed"),
        };

        return new Response(JSON.stringify(result, null, 2), {
            status: 200, headers: corsHeaders(),
        });
    }

    if (url.pathname === "/" || url.pathname === "") {
        const info = {
            name: "ProxyIP Checker Worker",
            version: "2 (real TCP handshake via cloudflare:sockets)",
            endpoints: { "/check?ip=1.2.3.4": "Check single IP" },
            risk_score: "0-100 (lower = cleaner)",
            filter_tip: "Use success=true AND risk<=10 for best proxyIPs",
        };
        return new Response(JSON.stringify(info, null, 2), { status: 200, headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders() });
}

export default { fetch: handleRequest };
