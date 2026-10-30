import { headers } from "next/headers";
import Link from "next/link";
import CodeTabs from "@/components/CodeTabs";
import SiteNav from "@/components/SiteNav";
import { ArrowIcon, ExternalIcon } from "@/components/Icons";
import { REPO_URL } from "@/lib/site";

export const metadata = {
  title: "JSON API — PagePulse",
  description:
    "Audit any page from your own code. One endpoint, no key: POST a URL, get real Lighthouse scores, 40+ on-page checks and a prioritised fix list as JSON.",
};

const REQUEST_FIELDS = [
  { name: "url", type: "string", required: true, note: "Any public http(s) URL. “example.com” is fine — https:// is added for you." },
];

const JOB_FIELDS = [
  { name: "id", type: "string", note: "Job id. Poll it with GET /api/audit?id=…" },
  { name: "status", type: "enum", note: "queued · running · done · error" },
  { name: "stage", type: "enum", note: "queued · fetch · rules · lighthouse · ai · done — what the worker is doing right now." },
  { name: "position", type: "number | null", note: "1-based place in the queue. null once the audit is running." },
  { name: "etaSeconds", type: "number | null", note: "Rough wait estimate, based on the queue depth." },
  { name: "elapsedMs", type: "number", note: "Milliseconds since the job was created." },
  { name: "report", type: "object", note: "Present when status is done. See the report schema below." },
  { name: "error", type: "string", note: "Present when status is error. Safe to show to end users." },
];

const REPORT_FIELDS = [
  { name: "overall", type: "number", note: "0-100, averaged from the four Lighthouse categories when available." },
  { name: "grade", type: "string", note: "A+ · A · B · C · D from the overall score." },
  { name: "perfSource", type: "string | null", note: "local-lighthouse or pagespeed — which engine produced the scores." },
  { name: "scoreBasis", type: "string", note: "lighthouse when measured, rules when the browser could not run (then it is labelled, never faked)." },
  { name: "categories", type: "array", note: "The four Lighthouse scores: performance, accessibility, seo, best-practices." },
  { name: "issues", type: "array", note: "Every finding: id, category, severity (critical · warning · info · pass), title, detail, fix." },
  { name: "meta", type: "object", note: "Raw page facts: title, description, h1Count, imagesTotal, imagesMissingAlt, htmlBytes, https, statusCode…" },
  { name: "metrics", type: "object", note: "Core Web Vitals as display strings: lcp, cls, tbt, fcp, speedIndex." },
  { name: "proposal", type: "string", note: "Rule-based proposal paragraph. Always present, no AI key required." },
  { name: "ai", type: "object | null", note: "headline, topIssues[], quickWins[], proposalBlurb — null when no AI key is configured." },
];

const ERRORS = [
  { code: "400", body: "Invalid or missing url, or a private host (localhost, 10.x, 192.168.x, *.internal).", when: "Bad request" },
  { code: "404", body: "Unknown or expired job id. Reports live in memory and are dropped after the TTL.", when: "Poll too late" },
  { code: "429", body: "More audits than AUDIT_IP_MAX from the same IP inside one minute.", when: "Rate limited" },
  { code: "502", body: "The target page refused the fetch, timed out, or blocked bots.", when: "Target unreachable" },
  { code: "503", body: "The queue is full (AUDIT_QUEUE_MAX waiting jobs). Retry in a few seconds.", when: "Queue full" },
];

const LIMITS = [
  { name: "AUDIT_CONCURRENCY", def: "2", note: "Audits running at once. One Lighthouse run ≈ 15 s and a few hundred MB." },
  { name: "AUDIT_QUEUE_MAX", def: "20", note: "Waiting jobs before the API answers 503." },
  { name: "AUDIT_JOB_TIMEOUT_MS", def: "180000", note: "A job is marked failed after three minutes." },
  { name: "AUDIT_JOB_TTL_MS", def: "600000", note: "Finished reports stay pollable for ten minutes, then vanish." },
  { name: "AUDIT_IP_MAX", def: "8", note: "Audits per IP per minute." },
];

export default function ApiDocsPage() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.includes("localhost") || host.startsWith("127.");
  const origin = `${h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https")}://${host}`;

  const curlQuick = `# Start an audit. Queue mode answers immediately with 202 + a job id.
curl -s -X POST ${origin}/api/audit \\
  -H 'content-type: application/json' \\
  -d '{"url":"example.com"}'

# Poll until status is "done" (typically 12-20 s)
curl -s "${origin}/api/audit?id=<job id>"`;

  const jsQuick = `const res = await fetch("/api/audit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: "example.com" }),
});

const data = await res.json();

// Long-running host: poll the job. Serverless host: the report is already here.
let job = data.job ?? { status: "done", report: data.report };

while (job.status === "queued" || job.status === "running") {
  await new Promise((r) => setTimeout(r, 1500));
  const poll = await fetch("/api/audit?id=" + job.id).then((r) => r.json());
  job = poll.job;
}

if (job.status === "done") {
  console.log(job.report.overall, job.report.grade);
  for (const issue of job.report.issues) {
    console.log(issue.severity, issue.title, "->", issue.fix);
  }
} else {
  console.error(job.error);
}`;

  const pyQuick = `import time, requests

BASE = "${origin}"

res = requests.post(BASE + "/api/audit", json={"url": "example.com"}, timeout=300)
data = res.json()

job = data.get("job") or {"status": "done", "report": data.get("report")}

while job["status"] in ("queued", "running"):
    time.sleep(1.5)
    job = requests.get(BASE + "/api/audit", params={"id": job["id"]}, timeout=60).json()["job"]

if job["status"] == "done":
    report = job["report"]
    print(report["overall"], report["grade"], report["perfSource"])
    for issue in report["issues"]:
        if issue["severity"] in ("critical", "warning"):
            print(issue["severity"], issue["title"])
else:
    print("failed:", job["error"])`;

  const res202 = `HTTP/1.1 202 Accepted
{
  "status": "queued",
  "job": {
    "id": "b1f0c4d2-6a1e-4f3b-9d0a-77c1f2ab31de",
    "url": "https://example.com/",
    "status": "queued",
    "stage": "queued",
    "position": 1,
    "queueLength": 1,
    "running": 1,
    "elapsedMs": 0,
    "etaSeconds": 18
  },
  "queue": { "running": 1, "queued": 1, "concurrency": 2, "maxQueue": 20 }
}`;

  const resDone = `HTTP/1.1 200 OK
{
  "status": "done",
  "job": {
    "id": "b1f0c4d2-6a1e-4f3b-9d0a-77c1f2ab31de",
    "url": "https://example.com/",
    "status": "done",
    "stage": "done",
    "position": null,
    "elapsedMs": 14320,
    "report": {
      "url": "https://example.com/",
      "finalUrl": "https://example.com/",
      "fetchedAt": "2026-10-30T03:12:44.201Z",
      "overall": 94,
      "grade": "A",
      "scoreBasis": "lighthouse",
      "perfSource": "local-lighthouse",
      "perfNote": "Lighthouse 13 run in headless Chrome",
      "lighthouseError": null,
      "categories": [
        { "key": "performance",    "label": "Performance",   "score": 100 },
        { "key": "accessibility",  "label": "Accessibility", "score": 96  },
        { "key": "seo",            "label": "SEO",           "score": 80  },
        { "key": "best-practices", "label": "Best practices","score": 100 }
      ],
      "issues": [
        {
          "id": "meta-description",
          "category": "seo",
          "severity": "warning",
          "title": "Missing meta description",
          "detail": "Search engines will invent one from the page text.",
          "fix": "Add <meta name=\\"description\\" content=\\"...\\"> with 120-155 characters."
        }
      ],
      "meta": {
        "title": "Example Domain",
        "description": null,
        "h1Count": 1,
        "imagesTotal": 0,
        "imagesMissingAlt": 0,
        "htmlBytes": 1256,
        "hasStructuredData": false,
        "hasOpenGraph": false,
        "hasCanonical": false,
        "hasViewport": true,
        "lang": "en",
        "https": true,
        "server": "ECS",
        "statusCode": 200
      },
      "metrics": {
        "lcp": "0.9 s",
        "cls": "0.00",
        "tbt": "0 ms",
        "fcp": "0.6 s",
        "speedIndex": "0.9 s"
      },
      "proposal": "I ran an automated Lighthouse audit against example.com ...",
      "ai": null,
      "aiEnabled": false
    }
  },
  "queue": { "running": 0, "queued": 0, "concurrency": 2, "maxQueue": 20 }
}`;

  const resError = `HTTP/1.1 429 Too Many Requests
{ "error": "Too many audits from your address. Please wait a minute and try again." }

HTTP/1.1 400 Bad Request
{ "error": "That host is not allowed." }`;

  return (
    <>
      <SiteNav />

      <main className="container docs-main">
        <header className="docs-hero">
          <p className="section-kicker">JSON API · v1</p>
          <h1>
            Audit any page
            <br />
            from <span className="grad">your own code</span>
          </h1>
          <p className="docs-lede">
            One endpoint. No key, no signup, no quota to buy. Post a URL and get the same real
            Lighthouse scores, 40+ on-page checks and prioritised fix list the page shows — as JSON.
          </p>

          <div className="chip-row">
            <span className="chip">No auth</span>
            <span className="chip">JSON in / JSON out</span>
            <span className="chip">MIT licensed</span>
            <a className="chip chip-link" href="/openapi.json" target="_blank" rel="noreferrer">
              OpenAPI 3.1 <ExternalIcon size={12} />
            </a>
          </div>
        </header>

        <div className="docs-layout">
          <aside className="docs-toc">
            <p>On this page</p>
            <a href="#quick-start">Quick start</a>
            <a href="#start">POST /api/audit</a>
            <a href="#poll">GET /api/audit</a>
            <a href="#report">Report object</a>
            <a href="#errors">Errors</a>
            <a href="#limits">Limits</a>
          </aside>

          <div className="docs-body">
        <section className="docs-section" id="quick-start">
          <h2>Quick start</h2>
          <p className="docs-p">
            Every path is relative to this deployment. The snippets below are pre-filled with{" "}
            <code className="inline-code">{origin}</code>.
          </p>
          <CodeTabs
            tabs={[
              { label: "cURL", code: curlQuick },
              { label: "JavaScript", code: jsQuick },
              { label: "Python", code: pyQuick },
            ]}
          />
        </section>

        <section className="docs-section" id="start">
          <h2>
            <span className="method method-post">POST</span>
            <span className="endpoint-path">/api/audit</span>
          </h2>
          <p className="docs-p">
            Starts an audit. The response shape depends on the host: a long-running server queues the
            job and answers <b>202</b>, while a serverless platform (Vercel, Netlify, Lambda) has no
            shared memory between requests and runs the audit inline, answering <b>200</b> with the
            finished report. Clients handle both — see the snippet above.
          </p>

          <h3>Request body</h3>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {REQUEST_FIELDS.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code className="inline-code">{f.name}</code>
                  </td>
                  <td className="dim">{f.type}</td>
                  <td className="dim">{f.required ? "yes" : "no"}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Response — queued</h3>
          <CodeTabs tabs={[{ label: "202 Accepted", code: res202 }]} title="job created" />

          <h3>Response — finished</h3>
          <CodeTabs tabs={[{ label: "200 OK", code: resDone }]} title="report ready" />
        </section>

        <section className="docs-section" id="poll">
          <h2>
            <span className="method method-get">GET</span>
            <span className="endpoint-path">/api/audit?id=&lt;job id&gt;</span>
          </h2>
          <p className="docs-p">
            Polls a job. Cheap and safe to call every 1-2 seconds. When <code className="inline-code">status</code>{" "}
            is <code className="inline-code">done</code> the payload also carries{" "}
            <code className="inline-code">report</code>. Reports are held in memory, scoped to the IP
            that created them, and never written to disk.
          </p>

          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {JOB_FIELDS.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code className="inline-code">{f.name}</code>
                  </td>
                  <td className="dim">{f.type}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="docs-section" id="report">
          <h2>Report object</h2>
          <p className="docs-p">
            The same structure the browser renders. Everything is measured, nothing is invented — when
            Chrome cannot run, the response says so in <code className="inline-code">scoreBasis</code>{" "}
            and <code className="inline-code">lighthouseError</code>.
          </p>

          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {REPORT_FIELDS.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code className="inline-code">{f.name}</code>
                  </td>
                  <td className="dim">{f.type}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="docs-section" id="errors">
          <h2>Errors</h2>
          <p className="docs-p">
            Always <code className="inline-code">{`{ "error": "…" }`}</code> with a message safe to
            show to a human.
          </p>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>When</th>
                <th>Body</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((e) => (
                <tr key={e.code}>
                  <td>
                    <span className={`method ${e.code === "429" || e.code === "503" ? "method-warn" : "method-err"}`}>
                      {e.code}
                    </span>
                  </td>
                  <td className="dim">{e.when}</td>
                  <td>{e.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <CodeTabs tabs={[{ label: "Examples", code: resError }]} title="error shapes" />
        </section>

        <section className="docs-section" id="limits">
          <h2>Limits</h2>
          <p className="docs-p">
            A Lighthouse run costs about 15 seconds and a few hundred megabytes, so the public instance
            is deliberately conservative. All of it is configurable when you self-host.
          </p>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Default</th>
                <th>What it controls</th>
              </tr>
            </thead>
            <tbody>
              {LIMITS.map((l) => (
                <tr key={l.name}>
                  <td>
                    <code className="inline-code">{l.name}</code>
                  </td>
                  <td className="dim">{l.def}</td>
                  <td>{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="docs-cta">
          <div>
            <h3>Self-host it instead</h3>
            <p>
              Clone the repo, run <code className="inline-code">npm install &amp;&amp; npm run dev</code>. Chrome
              ships with the app on serverless hosts, so there is nothing else to configure — and no
              keys to buy.
            </p>
          </div>
          <div className="docs-cta-actions">
            <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">
              Get the source
              <ExternalIcon size={15} />
            </a>
            <Link className="btn btn-ghost" href="/#audit">
              Try it in the browser
              <ArrowIcon size={15} />
            </Link>
          </div>
        </section>
          </div>
        </div>
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <span>PagePulse — MIT licensed. Built with Next.js and Google Lighthouse.</span>
          <div className="foot-links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="/openapi.json">OpenAPI</a>
            <Link href="/">Home</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
