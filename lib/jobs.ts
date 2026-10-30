import { randomUUID } from "node:crypto";
import { runAudit } from "./audit";
import type { AuditReport, AuditStage } from "./types";

export type JobStatus = "queued" | "running" | "done" | "error";
export type Stage = "queued" | AuditStage;

interface Job {
  id: string;
  url: string;
  status: JobStatus;
  stage: Stage;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  report: AuditReport | null;
  error: string | null;
  /** Set when the job was abandoned (timeout) so a late result is discarded */
  cancelled: boolean;
  ip: string;
}

export interface JobView {
  id: string;
  url: string;
  status: JobStatus;
  stage: Stage;
  /** 1-based place in the queue, null once running */
  position: number | null;
  queueLength: number;
  running: number;
  elapsedMs: number;
  etaSeconds: number | null;
  report?: AuditReport;
  error?: string;
}

const CONCURRENCY = Math.max(1, Number(process.env.AUDIT_CONCURRENCY ?? 2));
const MAX_QUEUE = Math.max(1, Number(process.env.AUDIT_QUEUE_MAX ?? 20));
const JOB_TIMEOUT_MS = Math.max(30_000, Number(process.env.AUDIT_JOB_TIMEOUT_MS ?? 180_000));
const JOB_TTL_MS = Math.max(60_000, Number(process.env.AUDIT_JOB_TTL_MS ?? 600_000));

/** Per-IP abuse guard: a single visitor can not fill the queue. */
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = Math.max(1, Number(process.env.AUDIT_IP_MAX ?? 8));

const jobs = new Map<string, Job>();
const queue: string[] = [];
const ipHits = new Map<string, { count: number; resetAt: number }>();

let running = 0;

export function queueStats() {
  return { running, queued: queue.length, concurrency: CONCURRENCY, maxQueue: MAX_QUEUE };
}

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
  }
  for (const [ip, hit] of ipHits) {
    if (now > hit.resetAt) ipHits.delete(ip);
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || now > hit.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  if (hit.count >= IP_MAX_PER_WINDOW) return false;
  hit.count += 1;
  return true;
}

export type EnqueueResult =
  | { ok: true; view: JobView }
  | { ok: false; reason: "queue_full" | "rate_limited"; view: null };

export function enqueueAudit(url: string, ip: string): EnqueueResult {
  prune();

  if (!checkRateLimit(ip)) {
    return { ok: false, reason: "rate_limited", view: null };
  }
  if (queue.length >= MAX_QUEUE) {
    return { ok: false, reason: "queue_full", view: null };
  }

  const job: Job = {
    id: randomUUID(),
    url,
    status: "queued",
    stage: "queued",
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    report: null,
    error: null,
    cancelled: false,
    ip,
  };

  jobs.set(job.id, job);
  queue.push(job.id);
  pump();

  return { ok: true, view: viewOf(job) };
}

function viewOf(job: Job): JobView {
  const now = Date.now();
  const position = job.status === "queued" ? queue.indexOf(job.id) + 1 : null;
  const elapsed = (job.finishedAt ?? now) - (job.startedAt ?? job.createdAt);

  // Rough ETA: everything ahead of us divided by the number of workers, at an
  // observed average of ~25s per audit.
  const ahead = position === null ? 0 : position - 1;
  const etaSeconds =
    job.status === "done" || job.status === "error"
      ? null
      : Math.max(5, Math.round(((ahead + 1) * 25) / CONCURRENCY));

  return {
    id: job.id,
    url: job.url,
    status: job.status,
    stage: job.stage,
    position,
    queueLength: queue.length,
    running,
    elapsedMs: elapsed,
    etaSeconds,
    ...(job.report ? { report: job.report } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

export function getJob(id: string, ip: string): JobView | null {
  const job = jobs.get(id);
  if (!job) return null;
  // Jobs are only visible to the visitor that created them.
  if (job.ip !== ip) return null;
  return viewOf(job);
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    const job = jobs.get(id);
    if (!job || job.status !== "queued") continue;
    void start(job);
  }
}

async function start(job: Job) {
  running += 1;
  job.status = "running";
  job.startedAt = Date.now();
  job.stage = "fetch";

  const timer = setTimeout(() => {
    if (job.status !== "running") return;
    job.cancelled = true;
    job.status = "error";
    job.finishedAt = Date.now();
    job.error = `Audit timed out after ${Math.round(JOB_TIMEOUT_MS / 1000)}s. The site may be blocking bots or responding too slowly.`;
  }, JOB_TIMEOUT_MS);

  try {
    const report = await runAudit(job.url, (stage) => {
      if (!job.cancelled) job.stage = stage;
    });
    if (!job.cancelled) {
      job.report = report;
      job.status = "done";
      job.stage = "done";
      job.finishedAt = Date.now();
    }
  } catch (err) {
    if (!job.cancelled) {
      job.status = "error";
      job.finishedAt = Date.now();
      job.error =
        err instanceof Error ? err.message : "Could not audit that page. It may be blocking bots.";
    }
  } finally {
    clearTimeout(timer);
    running -= 1;
    pump();
  }
}

/**
 * Runs an audit inline, bypassing the queue.
 *
 * Serverless platforms do not keep this module in memory between requests, so a
 * queued job could be polled on a different instance and appear to vanish. There
 * the request is executed synchronously instead.
 */
export async function runAuditInline(url: string, ip: string, timeoutMs = JOB_TIMEOUT_MS) {
  if (!checkRateLimit(ip)) {
    throw Object.assign(new Error("Too many audits from this address. Wait a minute and retry."), {
      status: 429,
    });
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Audit timed out after ${Math.round(timeoutMs / 1000)}s.`)),
      timeoutMs
    );
  });

  try {
    const report = await Promise.race([runAudit(url), timeout]);
    return report;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
