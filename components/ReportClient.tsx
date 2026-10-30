"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AuditReport, AuditStage, Issue, Severity } from "@/lib/types";
import {
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalIcon,
  GlobeIcon,
  RefreshIcon,
} from "./Icons";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function scoreColor(score: number | null): string {
  if (score === null) return "var(--muted-2)";
  if (score >= 90) return "var(--good)";
  if (score >= 70) return "var(--ok)";
  return "var(--bad)";
}

const STAGES: { key: AuditStage; label: string; hint: string }[] = [
  { key: "fetch", label: "Fetching the page", hint: "HTML, status code and response headers" },
  { key: "rules", label: "Running 40+ rule checks", hint: "SEO, content, accessibility, security" },
  { key: "lighthouse", label: "Measuring Core Web Vitals", hint: "Headless Chrome + Google Lighthouse" },
  { key: "ai", label: "Writing the summary", hint: "Ranking what to fix first" },
];

const ORDER: Record<string, number> = { queued: -1, fetch: 0, rules: 1, lighthouse: 2, ai: 3, done: 4 };

const VITAL_RULES: Record<string, { good: number; ok: number; unit: "s" | "ms" | "none" }> = {
  LCP: { good: 2.5, ok: 4, unit: "s" },
  FCP: { good: 1.8, ok: 3, unit: "s" },
  "Speed Index": { good: 3.4, ok: 5.8, unit: "s" },
  CLS: { good: 0.1, ok: 0.25, unit: "none" },
  TBT: { good: 200, ok: 600, unit: "ms" },
};

function numeric(raw: string): number | null {
  const match = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function vitalTone(key: string, raw: string): "good" | "ok" | "bad" | null {
  const rule = VITAL_RULES[key];
  const value = numeric(raw);
  if (!rule || value === null) return null;
  if (value <= rule.good) return "good";
  if (value <= rule.ok) return "ok";
  return "bad";
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/* -------------------------------------------------------------------------- */
/* component                                                                  */
/* -------------------------------------------------------------------------- */

type Status = "idle" | "queued" | "running" | "done" | "error";

export default function ReportClient() {
  const params = useSearchParams();
  const url = params.get("url") ?? "";

  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<AuditStage | "queued">("queued");
  const [position, setPosition] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | Severity>("all");

  const startedAt = useRef<number>(0);

  /* ---- run / poll ---- */
  useEffect(() => {
    if (!url) {
      setError("No URL provided.");
      setStatus("error");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    setReport(null);
    setError(null);
    setPosition(null);
    setStatus("queued");
    setStage("queued");
    startedAt.current = Date.now();
    setElapsed(0);

    const finish = (data: AuditReport) => {
      if (cancelled) return;
      setReport(data);
      setStatus("done");
      setStage("done");
    };

    const fail = (message: string) => {
      if (cancelled) return;
      setError(message);
      setStatus("error");
    };

    const applyJob = (job: {
      status?: string;
      stage?: string;
      position?: number | null;
      queueLength?: number;
      error?: string;
      report?: AuditReport;
    }) => {
      if (job.stage) setStage(job.stage as AuditStage | "queued");
      if (typeof job.position === "number" || job.position === null) setPosition(job.position ?? null);
      if (typeof job.queueLength === "number") setQueueLength(job.queueLength);
      if (job.status === "running") setStatus("running");
      if (job.status === "queued") setStatus("queued");
      if (job.status === "done" && job.report) finish(job.report);
      if (job.status === "error") fail(job.error ?? "The audit failed.");
    };

    const poll = async (id: string) => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/audit?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          fail(data?.error ?? "This audit is no longer available.");
          return;
        }
        applyJob(data.job ?? {});
        if (data.job?.status === "done" || data.job?.status === "error") return;
      } catch {
        /* transient network hiccup — keep polling */
      }
      timer = setTimeout(() => void poll(id), 1100);
    };

    const run = async () => {
      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          fail(data?.error ?? "Could not start the audit.");
          return;
        }

        // Serverless deployments answer synchronously.
        if (data.status === "done" && data.report) {
          finish(data.report as AuditReport);
          return;
        }

        const job = data.job;
        if (!job?.id) {
          fail("The audit could not be queued.");
          return;
        }
        applyJob(job);
        timer = setTimeout(() => void poll(job.id), 700);
      } catch {
        fail("Network error — check your connection and try again.");
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [url, nonce]);

  /* ---- elapsed timer ---- */
  useEffect(() => {
    if (status !== "running" && status !== "queued") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [status]);

  /* ---- derived ---- */
  const proposalText = report?.ai?.proposalBlurb || report?.proposal || "";
  const allCategoriesMissing = Boolean(report) && report!.categories.every((c) => c.score === null);
  const shownScore = useCountUp(report?.overall ?? 0);
  const ringColor = report ? scoreColor(report.overall) : "var(--muted-2)";

  const counts = useMemo(() => {
    const base: Record<string, number> = { critical: 0, warning: 0, info: 0, pass: 0 };
    for (const issue of report?.issues ?? []) base[issue.severity] = (base[issue.severity] ?? 0) + 1;
    return base;
  }, [report]);

  const visibleIssues = useMemo<Issue[]>(() => {
    if (!report) return [];
    if (filter === "all") return report.issues;
    return report.issues.filter((issue) => issue.severity === filter);
  }, [report, filter]);

  const copyProposal = useCallback(async () => {
    if (!proposalText) return;
    try {
      await navigator.clipboard.writeText(proposalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }, [proposalText]);

  const stageIndex = ORDER[stage] ?? -1;
  const progressPct =
    status === "done" ? 100 : Math.max(6, Math.min(96, ((stageIndex + 1) / STAGES.length) * 100));

  /* ---------------------------------------------------------------- */

  return (
    <>
      <header className="report-bar">
        <div className="container report-bar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">P</span>
          </Link>
          <div className="site">
            <span className="site-url">{report?.finalUrl ?? url ?? "—"}</span>
          </div>
          <div className="actions">
            {report && (
              <a
                className="btn btn-ghost btn-sm hide-sm"
                href={report.finalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Visit site
                <ExternalIcon size={13} />
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNonce((n) => n + 1)}
              disabled={status === "running" || status === "queued"}
            >
              <RefreshIcon size={14} />
              Re-run
            </button>
            <Link href="/" className="btn btn-sm">
              New audit
            </Link>
          </div>
        </div>
      </header>

      <main className="container report-wrap">
        {/* ---------------- running ---------------- */}
        {(status === "queued" || status === "running") && (
          <div className="progress-wrap">
            <div className="progress-head">
              <p className="target">{url}</p>
              <h2>
                {status === "queued"
                  ? position && position > 1
                    ? `Waiting in the queue — position ${position}`
                    : "Starting the audit…"
                  : "Auditing your site"}
              </h2>
              <p>
                {(elapsed / 1000).toFixed(1)}s elapsed
                {status === "queued" && queueLength > 0 ? ` · ${queueLength} in queue` : ""}
              </p>
            </div>

            <div className="progress-bar">
              <i style={{ width: `${progressPct}%` }} />
            </div>

            <div className="stage-list">
              {STAGES.map((item, index) => {
                const state =
                  stageIndex > index ? "done" : stageIndex === index ? "active" : "pending";
                return (
                  <div className={`stage ${state}`} key={item.key}>
                    <span className="mark">{state === "done" ? <CheckIcon size={12} /> : null}</span>
                    <span className="label">
                      {item.label}
                      <span className="hint">{item.hint}</span>
                    </span>
                    <span className="time">{state === "done" ? "done" : state === "active" ? "…" : ""}</span>
                  </div>
                );
              })}
            </div>

            {status === "queued" && position && position > 1 && (
              <p className="queue-note">
                <b>{position - 1}</b> audit{position - 1 === 1 ? "" : "s"} ahead of you. Each one takes
                about 20 seconds — this page updates automatically.
              </p>
            )}
          </div>
        )}

        {/* ---------------- error ---------------- */}
        {status === "error" && (
          <div className="error-box">
            <h3>Could not audit this page</h3>
            <p>{error}</p>
            <p style={{ marginTop: 10 }}>
              Some sites block automated requests, require a login, or are simply too slow to load.
              Try the homepage, or a different URL.
            </p>
            <div className="error-actions">
              <Link href="/" className="btn">
                Try another URL
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => setNonce((n) => n + 1)}>
                <RefreshIcon size={14} />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ---------------- report ---------------- */}
        {status === "done" && report && (
          <>
            <section className="report-hero">
              <div>
                <h1>{report.meta.title ?? "Untitled page"}</h1>
                <div className="report-meta">
                  <span className="meta-pill">
                    <GlobeIcon size={12} />
                    {report.meta.statusCode}
                  </span>
                  <span className={`meta-pill ${report.meta.https ? "good" : "bad"}`}>
                    {report.meta.https ? "HTTPS" : "No HTTPS"}
                  </span>
                  <span className="meta-pill">
                    <ClockIcon size={12} />
                    {new Date(report.fetchedAt).toLocaleTimeString()}
                  </span>
                  <span className="meta-pill">{report.issues.length} findings</span>
                  {report.meta.lang ? <span className="meta-pill">lang={report.meta.lang}</span> : null}
                </div>
              </div>

              <div className="grade-badge" style={{ borderColor: ringColor }}>
                <span className="letter" style={{ color: ringColor }}>
                  {report.grade}
                </span>
                <span className="of">
                  {report.scoreBasis === "lighthouse" ? "measured" : "estimated"}
                </span>
              </div>
            </section>

            {report.scoreBasis === "rules" && (
              <div className="notice">
                <b>Lighthouse could not run.</b>{" "}
                {report.lighthouseError ?? "No Chrome build was available."} The score below is{" "}
                <b>estimated from {report.issues.length} rule checks</b>, not measured.
              </div>
            )}

            <section className="score-panel">
              <div className="score-card">
                <div
                  className="score-ring"
                  style={{ ["--val" as string]: shownScore, ["--ring" as string]: ringColor }}
                >
                  <span className="num" style={{ color: ringColor }}>
                    {shownScore}
                  </span>
                  <span className="denom">/ 100</span>
                </div>
                <div className="score-cap">
                  {report.scoreBasis === "lighthouse" ? "Measured overall score" : "Estimated overall score"}
                </div>
              </div>

              <div>
                {allCategoriesMissing ? (
                  <div className="cat-placeholder">
                    <b>Category scores skipped</b>
                    <p>
                      The four Lighthouse categories need a working Chrome build. None was found, so
                      the numbers are left blank instead of guessed.
                    </p>
                  </div>
                ) : (
                  <div className="cat-grid">
                    {report.categories.map((category) => (
                      <div
                        className="cat"
                        key={category.key}
                        style={{ color: scoreColor(category.score) }}
                      >
                        <div className="cat-top">
                          <span className="cat-name">{category.label}</span>
                          <span className="cat-score">
                            {category.score === null ? "n/a" : category.score}
                          </span>
                        </div>
                        <div className="bar">
                          <i style={{ ["--w" as string]: `${category.score ?? 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(report.metrics).length > 0 && (
                  <div className="vitals">
                    {Object.entries(report.metrics).map(([key, value]) => {
                      const tone = vitalTone(key, value);
                      return (
                        <div className="vital" key={key}>
                          <div className="k">{key}</div>
                          <div
                            className="v"
                            style={{
                              color:
                                tone === "good"
                                  ? "var(--good)"
                                  : tone === "ok"
                                    ? "var(--ok)"
                                    : tone === "bad"
                                      ? "var(--bad)"
                                      : "var(--text)",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {report.perfNote && (
                  <p className="perf-source">
                    {report.perfSource === "pagespeed" ? <GlobeIcon size={12} /> : <CheckIcon size={12} />}
                    {report.perfNote}
                  </p>
                )}
              </div>
            </section>

            {report.ai && (
              <>
                <h2 className="section-title">AI recommendations</h2>
                <div className="ai-card">
                  <span className="ai-badge">
                    <CheckIcon size={11} /> Prioritised by impact
                  </span>
                  <p className="ai-headline">{report.ai.headline}</p>

                  {report.ai.topIssues.map((item, index) => (
                    <div className="ai-item" key={index}>
                      <span className="idx">{index + 1}</span>
                      <div>
                        <h4>{item.title}</h4>
                        <p>{item.why}</p>
                        <p className="fix">
                          <b>Fix:</b> {item.fix}
                        </p>
                      </div>
                    </div>
                  ))}

                  {report.ai.quickWins.length > 0 && (
                    <div className="quick-wins">
                      {report.ai.quickWins.map((win, index) => (
                        <span key={index}>{win}</span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {!report.aiEnabled && (
              <>
                <h2 className="section-title">AI recommendations</h2>
                <div className="notice">
                  <b>AI summary is off on this deployment.</b> Every rule check and score above still
                  ran normally. Set <code>AI_API_KEY</code> to enable the written summary.
                </div>
              </>
            )}

            {proposalText && (
              <>
                <h2 className="section-title">Proposal snippet</h2>
                <div className="proposal-box">
                  <div className="proposal-head">
                    <span className="t">
                      {report.ai?.proposalBlurb ? "AI-written · ready to send" : "Built from findings"}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={copyProposal}>
                      <CopyIcon size={13} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="proposal-body">{proposalText}</div>
                </div>
              </>
            )}

            <h2 className="section-title">All findings ({report.issues.length})</h2>

            <div className="filters">
              {(["all", "critical", "warning", "info"] as const).map((key) => {
                const n = key === "all" ? report.issues.length : counts[key] ?? 0;
                if (key !== "all" && n === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`filter${filter === key ? " active" : ""}`}
                    onClick={() => setFilter(key)}
                  >
                    {key === "all" ? "All" : key}
                    <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>

            {visibleIssues.length === 0 ? (
              <div className="cat-placeholder">
                <b>Nothing here.</b>
                <p>No findings at this severity — switch the filter to see the rest.</p>
              </div>
            ) : (
              visibleIssues.map((issue) => (
                <article className={`issue ${issue.severity}`} key={issue.id}>
                  <span className="stripe" />
                  <div className="issue-body">
                    <div className="issue-top">
                      <span className={`tag ${issue.severity}`}>{issue.severity}</span>
                      <span className="tag cat">{issue.category}</span>
                      <h4>{issue.title}</h4>
                    </div>
                    <p>{issue.detail}</p>
                    <div className="fix">
                      <b>Fix</b>
                      {issue.fix}
                    </div>
                  </div>
                </article>
              ))
            )}

            <div style={{ marginTop: 36, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" className="btn">
                Audit another site
                <ArrowIcon size={15} />
              </Link>
            </div>
          </>
        )}
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <span>PagePulse — MIT licensed. Reports are generated live and never stored.</span>
          <div className="foot-links">
            <Link href="/">Home</Link>
            <a href="/api/audit" rel="noreferrer">
              JSON API
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
