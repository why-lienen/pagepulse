# PagePulse ⚡

**Open-source AI website auditor.** Paste a URL → get instant performance, SEO,
accessibility and security findings, plus an AI-prioritised fix list and a
client-ready proposal blurb.

No signup. No database. Reports are generated live and never stored.

- **Source:** <https://github.com/why-lienen/pagepulse>
- **JSON API docs:** `GET /api-docs` — every endpoint, field and error code
- **OpenAPI 3.1:** `GET /openapi.json` — import into Postman, Insomnia, or generate a client

---

## What it checks

| Area | Checks |
|---|---|
| **Performance** | Lighthouse mobile score, LCP, CLS, TBT, FCP, Speed Index, HTML payload size |
| **SEO** | Title length, meta description, H1 structure, canonical, sitemap.xml, robots.txt, structured data (JSON-LD) |
| **Accessibility** | Missing image `alt` text, Lighthouse accessibility score |
| **Security** | HTTPS, mixed content, HSTS, `X-Content-Type-Options`, frame protection (CSP / `X-Frame-Options`), `Referrer-Policy` |
| **Mobile** | Viewport meta tag |
| **Content / Social** | Open Graph tags, HTTP status |

Then the AI layer (optional) turns all of it into:

1. a one-line verdict,
2. the 4 highest-impact issues with *why it matters* and *how to fix it*,
3. quick wins,
4. a **copy-for-proposal** paragraph you can paste into a client pitch.

---

## Quick start

```bash
# 1. install
npm install

# 2. (optional) enable AI + higher PageSpeed quota
cp .env.example .env.local
# then edit .env.local and add AI_API_KEY (DeepSeek or OpenAI)

# 3. run
npm run dev
# open http://localhost:3000
```

The app works **without any API key** — every rule check, the four Lighthouse
scores, and the proposal snippet all run locally with zero cost. Only the AI
"why it matters" layer is skipped.

### Where the four Lighthouse scores come from

PagePulse always runs **real** Lighthouse — never an estimate — and it needs no
Google account anywhere. Chrome is resolved in this order:

| Step | Chrome build | Used on |
|---|---|---|
| 1 | `CHROME_PATH` | Docker images with Chrome installed |
| 2 | **`@sparticuz/chromium`** (bundled headless build) | Vercel, Netlify, AWS Lambda, any Linux server |
| 3 | Installed Chrome / Chromium / Edge (auto-detect) | macOS, Windows, desktop Linux |

So a visitor just pastes a URL. No key, no signup, no credit card — on any host.

The Google PageSpeed Insights API is still supported as an *optional* shortcut
(`PERF_PROVIDER=pagespeed`, or set `PAGESPEED_API_KEY` and it is preferred because
it is cheaper than booting a browser). If every path fails, the overall score
becomes a clearly-labelled **estimate** — it is never silently faked.

> **Why local Chrome instead of the PageSpeed API?** Because since 2024 Google
> Cloud requires a billing account (credit card) to create an API key, and
> mainland China is not an eligible billing country. Running Lighthouse ourselves
> removes that blocker for the operator *and* every visitor.

> **Node's `fetch` ignores the system proxy.** A browser can open google.com while
> the Node process cannot — that is expected. PagePulse auto-detects a local proxy
> on 7897 / 7890 / 7891 / 1087 / 1080 / 6152 / 8888 / 8080 / 10809 / 33210 during
> development and routes **both the page fetch and the Google request** through it,
> and passes it to headless Chrome as `--proxy-server`.

## Concurrency, queueing and abuse limits

A Lighthouse run costs ~15 s and a few hundred MB of RAM, so audits are queued:

- `AUDIT_CONCURRENCY` (default **2**) — audits running at once.
- `AUDIT_QUEUE_MAX` (default **20**) — waiting jobs before the API answers `503`.
- `AUDIT_JOB_TIMEOUT_MS` (default **180000**) — a job is failed after this.
- `AUDIT_JOB_TTL_MS` (default **600000**) — finished jobs are dropped after this.
- `AUDIT_IP_MAX` (default **8**) — audits per IP per minute (`429` above that).

`POST /api/audit` returns `202` with a job id; the browser polls
`GET /api/audit?id=…` and renders each stage as it completes. Jobs are in-memory,
scoped to the IP that created them, and never written to disk.

On serverless platforms (Vercel/Netlify/Lambda) there is no shared memory between
requests, so the route detects that and runs the audit synchronously instead of
queueing — the client handles both shapes transparently.

## HTTP API

Human-readable docs live at **`/api-docs`**, the machine-readable spec at
**`/openapi.json`**, and a liveness probe at **`/api/health`**. Opening
`/api/audit` in a browser without an id returns a self-describing JSON index
instead of an error.

```bash
# start an audit (queue mode)
curl -X POST localhost:3000/api/audit \
  -H 'content-type: application/json' \
  -d '{"url":"example.com"}'
# → 202 {"status":"queued","job":{"id":"…","position":1,…}}

# poll it
curl "localhost:3000/api/audit?id=<job id>"
# → {"job":{"status":"done","report":{ … }}}

# or block until done (serverless deployments answer this way)
curl -X POST localhost:3000/api/audit -d '{"url":"example.com"}' -H 'content-type: application/json'

# queue depth / uptime
curl localhost:3000/api/health
# → {"ok":true,"queue":{"running":0,"queued":0,"concurrency":2,"maxQueue":20}}
```

Private hosts (`localhost`, `10.x`, `192.168.x`, `172.16-31.x`, `*.internal`) are
rejected so the endpoint cannot be used as an SSRF pivot.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | no | `deepseek` (default) or `openai` |
| `AI_API_KEY` | no | Enables the AI summary. Any OpenAI-compatible key works. |
| `AI_BASE_URL` | no | Override the API base URL |
| `AI_MODEL` | no | Defaults to `deepseek-chat` / `gpt-4o-mini` |
| `PERF_PROVIDER` | no | `local` or `pagespeed`. Auto-detected when unset. |
| `PAGESPEED_API_KEY` | no | Optional. Only used when present. |
| `LIGHTHOUSE_TIMEOUT_MS` | no | Local Lighthouse timeout, default `120000`. |
| `CHROME_PATH` | no | Force a specific Chrome binary. |
| `DISABLE_LOCAL_LIGHTHOUSE` | no | `1` = never launch Chrome, API only. |
| `AUDIT_CONCURRENCY` | no | Parallel audits, default `2`. |
| `AUDIT_QUEUE_MAX` | no | Queue length, default `20`. |
| `AUDIT_JOB_TIMEOUT_MS` | no | Per-job timeout, default `180000`. |
| `AUDIT_JOB_TTL_MS` | no | How long finished reports stay pollable, default `600000`. |
| `AUDIT_IP_MAX` | no | Audits per IP per minute, default `8`. |
| `PSI_PROXY` | no | HTTP proxy for the Google call, e.g. `http://127.0.0.1:7897`. |
| `PSI_DISABLE_PROXY` | no | Set to `1` to skip local proxy auto-detection. |

## Deploy

Works out of the box on [Vercel](https://vercel.com):

1. Push this repo to GitHub.
2. Import it on Vercel — the default Next.js preset is correct, no build flags.
3. Nothing else is required: Hobby gives every function 2 GB / 1 vCPU, which is
   enough to unpack Chromium and run Lighthouse.
4. Add the env vars above only if you want the AI summary (optional).
5. Deploy.

Node **22.x** is required: `@sparticuz/chromium` 153 needs `^22.17 || >=24` and
Lighthouse 13 needs `>=22.19`. `package.json` pins `"node": "22.x"`.

The routes declare `maxDuration = 300`, which is the ceiling on every plan with
fluid compute (Pro can go to 800). It is generous on purpose: a laptop finishes a
Lighthouse run in ~15 s, a single-vCPU serverless instance needs ~40-50 s, and
`LIGHTHOUSE_TIMEOUT_MS` (default 120 s) makes the runner give up before the
platform kills the request.

### Serverless bundle size

Lighthouse is spawned as a child process, so Next's tracer cannot see its
imports. `next.config.mjs` walks Lighthouse's dependency graph at build time and
feeds ~100 package globs to `outputFileTracingIncludes` (164 MB, plus a 67 MB
Chromium bundle — under the 250 MB function limit). `@sentry/*` and `zod` are
excluded because only the Lighthouse CLI uses them for crash reporting.

On Vercel the runner picks the bundled `@sparticuz/chromium`, so audits still get
real Lighthouse scores without an API key. Notes:

- Function memory matters more than CPU: 1024 MB is the practical minimum,
  2048 MB is comfortable.
- Cold starts add ~1-2 s while the Chromium bundle is unpacked.
- The first build is slow (10 min locally) because Next traces the Chromium and
  Lighthouse bundles. Later builds use the cache.
- Vercel has no persistent memory between requests, so the queue is bypassed and
  the audit runs inside the request — the API answers `{status:"done", report}`
  instead of a job id, and the client handles both.
- If the target site is slow, or the function runs out of memory, set
  `DISABLE_LOCAL_LIGHTHOUSE=1` and provide a `PAGESPEED_API_KEY` instead: the
  report then uses the Google API and labels its source. Rule checks, the score
  and the proposal snippet keep working with no browser at all.

Docker / a VPS is the cheapest way to run it at volume: install Chrome (or let the
bundled Chromium handle it), then `npm run build && npm start` with
`AUDIT_CONCURRENCY` set to roughly one per 512 MB of RAM.

> The audit runs server-side (Node runtime) because browsers cannot fetch
> arbitrary external URLs due to CORS. Vercel's default Node functions handle it.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- Node runtime API route for server-side fetching and analysis
- **Google Lighthouse** run locally in headless Chrome, or the **PageSpeed Insights API**
  (same engine) for real metrics
- **DeepSeek / OpenAI** for the AI summary (optional, OpenAI-compatible)
- Zero-database, zero-tracking

## Project structure

```
app/
  page.tsx              # landing page
  audit/page.tsx        # report page (client, reads ?url=)
  api/audit/route.ts    # POST → job id, GET ?id= → status/report
components/
  SiteNav.tsx
  AuditForm.tsx
  ReportClient.tsx      # polling, staged progress, report rendering
  Icons.tsx
lib/
  jobs.ts               # in-memory queue: concurrency, timeouts, per-IP limits
  audit.ts              # orchestrator
  fetchSite.ts          # server-side page fetch
  checks.ts             # rule-based HTML / header checks
  siteFiles.ts          # sitemap.xml / robots.txt
  perf.ts               # picks local Lighthouse or the PageSpeed API
  pagespeed.ts          # PageSpeed Insights wrapper (+ proxy + 429 hints)
  lighthouseLocal.ts    # spawns Chrome + Lighthouse in a child process
  ai.ts                 # LLM summary (optional)
  proposal.ts           # rule-based proposal snippet (no AI needed)
  score.ts              # scoring + grading
  types.ts
scripts/
  lighthouse-runner.mjs # standalone Lighthouse CLI (Chrome resolution lives here)
  smoke.ts              # engine self-test
```

## Roadmap

- [ ] History & shareable permanent report links (Supabase)
- [ ] Broken-link crawling
- [ ] Multi-page crawl (whole-site audit)
- [ ] PDF export
- [ ] Embeddable AI support widget (sister project)

## License

MIT
