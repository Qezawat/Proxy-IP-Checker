# 🛰️ ProxyIP Checker

A self-hosted ProxyIP / VLESS-VMess-Trojan edge IP checker, built on **Cloudflare Workers**.

It performs a **real TCP handshake** against candidate IPs (not just a `fetch()`, which gives false positives), enriches each result with **geolocation + risk scoring** from `ip-api.com`, and ships with a clean web UI for single, batch, CIDR-range, and remote-list scanning — all from your phone or desktop browser, no app install required.

<p align="center">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="No backend DB" src="https://img.shields.io/badge/database-none%20required-success">
  <img alt="Mobile friendly" src="https://img.shields.io/badge/UI-mobile%20friendly-orange">
</p>

---

## ✨ Features

| Feature | Description |
|---|---|
| ✅ Real TCP validation | Uses Cloudflare's `cloudflare:sockets` API to open a genuine TCP connection — eliminates false positives from plain `fetch()` checks |
| 🌍 Risk scoring | Every IP is scored `0–100` using `ip-api.com` flags (proxy/hosting/mobile + ASN heuristics) |
| ⚡ Live latency | Real connect-time latency (ms) measured per IP |
| 🧭 4 scan modes | Single IP · Pasted list · CIDR/dash range · Remote URL list |
| 📊 Sorted results | Auto-sorted by **working → lowest risk → lowest latency** |
| 💾 Export | One-click CSV / JSON export, or copy clean IPs to clipboard |
| 📱 No install | Pure static HTML — works in any mobile or desktop browser |
| 🆓 Free tier friendly | No KV, no D1, no environment secrets — a single stateless Worker |

---

## 📁 Project Structure

```
proxyip-checker/
├── worker/
│   ├── worker.js          # Cloudflare Worker — the checking API
│   └── wrangler.toml      # Worker config (for CLI deploy, optional)
├── web/
│   └── index.html         # Static web UI — single file, no build step
├── LICENSE
└── README.md
```

---

## 🧠 How It Works

```
┌─────────────┐        GET /check?ip=1.2.3.4        ┌──────────────────┐
│   web UI    │ ───────────────────────────────────▶ │ Cloudflare Worker │
│ (index.html)│ ◀─────────────────────────────────── │   (worker.js)     │
└─────────────┘            JSON result                └────────┬─────────┘
                                                                 │
                                          ┌──────────────────────┼────────────────────────┐
                                          ▼                                                ▼
                                ┌───────────────────┐                          ┌──────────────────────┐
                                │ cloudflare:sockets │                          │     ip-api.com        │
                                │ real TCP connect   │                          │ country / org / proxy │
                                │ to ip:443          │                          │ / hosting flags       │
                                └───────────────────┘                          └──────────────────────┘
```

1. The browser calls `GET /check?ip=<candidate>` on your deployed Worker.
2. The Worker opens a **real TCP socket** to `ip:443` using Cloudflare's raw sockets API — if the handshake doesn't complete within the timeout, the IP is marked `success: false`. This is the same principle used by community tools like `cmliu/CF-Workers-CheckProxyIP`, and avoids the false positives a plain `fetch()` produces.
3. In parallel, it queries `ip-api.com` for country, ISP, organization, and `proxy` / `hosting` flags.
4. A **risk score (0–100)** is computed from those flags plus ASN keyword heuristics (datacenter/CDN orgs score lower, known VPN/Tor keywords score higher).
5. Everything is returned as one JSON object — the UI sorts and renders it.

---

## 🚀 Deployment

### Option A — Cloudflare Dashboard (no CLI, easiest)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**
2. Give it a name (e.g. `proxyip-checker`) → **Deploy** (creates a placeholder)
3. Click **Edit code**
4. Delete the placeholder code, paste the full contents of [`worker/worker.js`](./worker/worker.js)
5. Click **Deploy**
6. Copy your Worker URL — it looks like `https://proxyip-checker.<your-subdomain>.workers.dev`

> ⚠️ **Requires the TCP Sockets API.** This is available on Cloudflare's Workers Free and Paid plans, but is a relatively recent feature — make sure your account has Workers enabled with no restrictions on outbound sockets.

### Option B — Wrangler CLI

```bash
cd worker
npm install -g wrangler     # if you don't have it
wrangler login
wrangler deploy
```

`wrangler.toml` is already configured — `wrangler deploy` will pick it up automatically.

### Connect the Web UI to your Worker

1. Open `web/index.html` in a text editor
2. Find this line near the top of the `<script>` block:
   ```js
   const WORKER = "https://my-checker.rockjudgement.workers.dev";
   ```
3. Replace it with **your own** Worker URL from the deploy step above
4. Save

---

## 🌐 Hosting the Web UI

The UI is a single static HTML file — host it anywhere:

| Method | Steps |
|---|---|
| **Cloudflare Pages** | Create a new Pages project, upload `web/index.html` as `index.html`, deploy |
| **GitHub Pages** | Push this repo, enable Pages on the `web/` folder (or root, your call) in repo Settings |
| **Just open it locally** | Double-click `index.html` — works fully offline-served, it only needs network access to reach your Worker |

> 💡 If hosting on GitHub Pages, point it at the `web/` directory, or move `index.html` to the repo root — either works, just keep the `WORKER` URL updated.

---

## 📖 Usage Guide (for end users)

Once deployed, open your hosted `index.html` (or the local file) in any browser — mobile or desktop.

### 1. Single IP

Type one IP into the box and hit **Check** or press <kbd>Enter</kbd>.

### 2. List

Switch to the **List** tab, paste one IP per line, click **Check All**. Handles any number of IPs (checked 6 at a time).

```
1.1.1.1
8.8.8.8
104.16.0.1
```

### 3. Range

Switch to the **Range** tab. Supports:

| Format | Example | Notes |
|---|---|---|
| CIDR | `1.2.3.0/24` | `/22`, `/23`, `/24` supported |
| Dash range | `1.2.3.10-1.2.3.50` | Max 1000 IPs per scan |

### 4. URL

Switch to the **URL** tab, paste a link to a plain-text IP list (one IP per line — e.g. a raw GitHub file), click **Fetch & Scan**.

> ⚠️ The target URL must allow CORS (cross-origin requests) for the browser to fetch it directly. Most `raw.githubusercontent.com` links work fine.

### Reading results

| Column | Meaning |
|---|---|
| **IP** | The checked address |
| **Status** | `OK` (TCP handshake succeeded) or `FAIL` |
| **Risk** | `0–100`, lower is cleaner — color-coded green/yellow/red |
| **Ping** | Real TCP connect latency in ms |
| **CC** | Country code |
| **Org** | ISP / organization name |

Results are automatically sorted: **working IPs first → lowest risk → lowest latency.**

### Exporting

At the bottom of the results panel:

- **Export CSV** — spreadsheet-friendly
- **Export JSON** — full raw data, all fields
- **Copy working IPs** — copies only `success=true AND risk≤10` IPs to clipboard, one per line, ready to paste into your proxy panel

---

## 🔧 API Reference

If you want to call the Worker directly (e.g. from your own scripts):

```
GET /check?ip=<ipv4>
```

**Example:**
```bash
curl "https://your-worker.workers.dev/check?ip=1.1.1.1"
```

**Response:**
```json
{
  "ip": "1.1.1.1",
  "success": true,
  "risk": 0,
  "risk_level": "low",
  "country": "AU",
  "city": "South Brisbane",
  "org": "APNIC and Cloudflare DNS Resolver project",
  "isp": "Cloudflare, Inc",
  "proxy_flag": false,
  "hosting": true,
  "port": 443,
  "latency_ms": 6,
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | `true` if a real TCP handshake completed on port 443 |
| `risk` | number | `0–100`, lower = cleaner |
| `risk_level` | string | `low` (≤10) / `medium` (≤40) / `high` (>40) |
| `latency_ms` | number\|null | Connect latency in ms, `null` if failed |
| `proxy_flag` | boolean\|null | Whether `ip-api.com` flags this as a known proxy/VPN |
| `hosting` | boolean\|null | Whether the IP belongs to a datacenter/hosting provider |
| `error` | string\|null | Failure reason if `success` is `false` |

---

## ⚠️ Limitations & Notes

- **Risk scoring is heuristic, not authoritative.** It's based on free, public `ip-api.com` data — useful as a quick filter, not a definitive fraud/abuse verdict.
- **CIDR support is capped at `/22`** in the web UI to avoid browser-side scans that take forever — for larger ranges, split them into chunks or use the URL-list mode with a pre-filtered list.
- **`ip-api.com` free tier rate limit:** ~45 requests/minute from the same IP. Heavy batch scans may hit this — if so, results will show `risk: 50` (unknown) as a fallback while `success` still reflects the real TCP check.
- This tool checks **TCP-level reachability only** — it confirms an IP is "alive" and accepting connections on port 443. It does **not** validate any specific proxy protocol (VLESS/Trojan/Shadowsocks) payload-level behavior.

---

## 📜 License

MIT — do whatever you want with it. See [`LICENSE`](./LICENSE).
