import { NextResponse } from "next/server";
import { enqueueAudit, getJob, queueStats, runAuditInline } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Serverless platforms do not keep this module alive between requests. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "local";
}

function normalize(input: string): { url: string } | { error: string; status: number } {
  const raw = input.trim();
  if (!raw) return { error: "Please provide a URL.", status: 400 };

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: "That does not look like a valid URL.", status: 400 };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported.", status: 400 };
  }

  // Block obviously private targets — this endpoint fetches arbitrary URLs, so it
  // must not become an SSRF pivot into the host's internal network.
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]";

  if (blocked) {
    return { error: "That host is not allowed.", status: 400 };
  }

  return { url: parsed.toString() };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = typeof (body as { url?: unknown })?.url === "string" ? (body as { url: string }).url : "";
  const normalized = normalize(input);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: normalized.status });
  }

  const ip = clientIp(req);

  // Serverless: run inline, one request = one audit.
  if (isServerless()) {
    try {
      const report = await runAuditInline(normalized.url, ip);
      return NextResponse.json({ status: "done", report, ...queueStats() });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502;
      const message =
        err instanceof Error ? err.message : "Could not audit that page. It may be blocking bots.";
      return NextResponse.json({ error: message }, { status });
    }
  }

  const result = enqueueAudit(normalized.url, ip);
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Too many audits from your address. Please wait a minute and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      {
        error: "The audit queue is full. Please try again in a few seconds.",
        queue: queueStats(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "queued", job: result.view, queue: queueStats() }, { status: 202 });
}

/** Opening the endpoint in a browser should explain itself, not throw a 400 at a human. */
function selfDescription(req: Request) {
  const origin = new URL(req.url).origin;
  return {
    name: "PagePulse API",
    version: "1",
    description:
      "Audit any public URL. Real Lighthouse scores, 40+ on-page checks and a prioritised fix list — no key, no signup.",
    docs: `${origin}/api-docs`,
    openapi: `${origin}/openapi.json`,
    endpoints: [
      {
        method: "POST",
        path: "/api/audit",
        body: { url: "example.com" },
        returns:
          "202 { status: 'queued', job } on a long-running server, 200 { status: 'done', report } when serverless",
      },
      {
        method: "GET",
        path: "/api/audit?id=<job id>",
        returns: "{ status, job } — job.report is present once status is 'done'",
      },
      { method: "GET", path: "/api/health", returns: "{ ok, version, queue }" },
    ],
    example: `curl -s -X POST ${origin}/api/audit -H 'content-type: application/json' -d '{"url":"example.com"}'`,
    queue: queueStats(),
  };
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(selfDescription(req), {
      headers: { "access-control-allow-origin": "*" },
    });
  }

  const job = getJob(id, clientIp(req));
  if (!job) {
    return NextResponse.json(
      { error: "That audit is no longer available. Please start a new one." },
      { status: 404 }
    );
  }

  return NextResponse.json({ status: job.status, job, queue: queueStats() });
}
