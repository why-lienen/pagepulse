import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { resolveProxy } from "./proxy";
import type { CategoryScore } from "./types";

export interface PageSpeedResult {
  categories: CategoryScore[];
  metrics: Record<string, string>;
  ok: boolean;
  error: string | null;
  /** How the request reached Google, e.g. "direct" or "proxy http://127.0.0.1:7897" */
  via: string | null;
}

const EMPTY: CategoryScore[] = [
  { key: "performance", label: "Performance", score: null },
  { key: "accessibility", label: "Accessibility", score: null },
  { key: "seo", label: "SEO", score: null },
  { key: "best-practices", label: "Best Practices", score: null },
];

function toScore(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function buildUrl(target: string): string {
  const params = new URLSearchParams();
  params.set("url", target);
  params.set("strategy", "mobile");
  for (const c of ["performance", "accessibility", "seo", "best-practices"]) {
    params.append("category", c);
  }
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
}

type ApiResponse = {
  status: number;
  ok: boolean;
  data: Record<string, unknown> | null;
  text: string;
};

async function callApi(
  target: string,
  dispatcher: Dispatcher | undefined,
  timeoutMs: number
): Promise<ApiResponse> {
  const res = await undiciFetch(buildUrl(target), {
    signal: AbortSignal.timeout(timeoutMs),
    dispatcher,
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data, text };
}

function parse(data: Record<string, unknown> | null): PageSpeedResult {
  const lh = (data?.lighthouseResult ?? {}) as Record<string, unknown>;
  const cats = (lh.categories ?? {}) as Record<string, { score?: unknown }>;
  const categories: CategoryScore[] = [
    { key: "performance", label: "Performance", score: toScore(cats.performance?.score) },
    { key: "accessibility", label: "Accessibility", score: toScore(cats.accessibility?.score) },
    { key: "seo", label: "SEO", score: toScore(cats.seo?.score) },
    { key: "best-practices", label: "Best Practices", score: toScore(cats["best-practices"]?.score) },
  ];

  const audits = (lh.audits ?? {}) as Record<string, { displayValue?: unknown }>;
  const metrics: Record<string, string> = {};
  const map: Record<string, string> = {
    "largest-contentful-paint": "LCP",
    "cumulative-layout-shift": "CLS",
    "total-blocking-time": "TBT",
    "first-contentful-paint": "FCP",
    "speed-index": "Speed Index",
  };
  for (const [k, label] of Object.entries(map)) {
    const display = audits[k]?.displayValue;
    if (typeof display === "string") metrics[label] = display;
  }

  const measured = categories.every((c) => c.score !== null);
  return {
    categories,
    metrics,
    ok: measured,
    error: measured
      ? null
      : "Lighthouse ran but returned no category scores for this URL (the page may block the test or be too slow).",
    via: null,
  };
}

const PROXY_HINT =
  "If your network needs a proxy, put PSI_PROXY=http://127.0.0.1:7897 in .env.local, or enable TUN mode in your proxy client.";

export async function fetchPageSpeed(url: string): Promise<PageSpeedResult> {
  const proxy = await resolveProxy();

  const attempts: { label: string; dispatcher?: Dispatcher }[] = [];
  if (proxy) {
    attempts.push({
      label: `proxy ${proxy.url} (${proxy.source})`,
      dispatcher: new ProxyAgent(proxy.url),
    });
  }
  attempts.push({ label: "direct" });

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const res = await callApi(url, attempt.dispatcher, attempt.label === "direct" ? 30000 : 45000);

      if (res.status === 429) {
        const hasKey = Boolean(process.env.PAGESPEED_API_KEY);
        return {
          categories: EMPTY,
          metrics: {},
          ok: false,
          error: hasKey
            ? "PageSpeed quota exceeded (HTTP 429). Your API key hit its daily limit — try again later."
            : "PageSpeed quota exceeded (HTTP 429). The anonymous quota is shared per IP, so it runs out fast — add a free PAGESPEED_API_KEY to .env.local (25,000 requests/day: https://developers.google.com/speed/docs/insights/v5/get-started).",
          via: attempt.label,
        };
      }

      if (!res.ok) {
        const apiError = res.data?.error as { message?: unknown } | undefined;
        const apiMessage =
          typeof apiError?.message === "string"
            ? apiError.message.slice(0, 200)
            : res.text.slice(0, 160);
        failures.push(`${attempt.label}: HTTP ${res.status} ${apiMessage}`);
        continue;
      }

      const parsed = parse(res.data);
      return { ...parsed, via: attempt.label };
    } catch (err) {
      const code =
        (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name ?? "request failed";
      failures.push(`${attempt.label}: ${code}`);
    }
  }

  return {
    categories: EMPTY,
    metrics: {},
    ok: false,
    error: `Could not reach the Google PageSpeed API — ${failures.join("; ")}. ${PROXY_HINT}`,
    via: null,
  };
}
