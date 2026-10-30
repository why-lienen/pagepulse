import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveProxy } from "./proxy";
import type { CategoryScore } from "./types";

export interface LocalLighthouseResult {
  categories: CategoryScore[];
  metrics: Record<string, string>;
  ok: boolean;
  error: string | null;
  /** Which Chrome build was used, for diagnostics */
  chrome: string | null;
}

const EMPTY: CategoryScore[] = [
  { key: "performance", label: "Performance", score: null },
  { key: "accessibility", label: "Accessibility", score: null },
  { key: "seo", label: "SEO", score: null },
  { key: "best-practices", label: "Best Practices", score: null },
];

const BEGIN = "__LH_BEGIN__";
const END = "__LH_END__";

/**
 * 45 s by default: serverless functions are capped at 60 s, so a longer budget
 * would just be killed by the platform instead of returning a readable error.
 * A local run takes ~15 s.
 */
const TIMEOUT_MS = Number(process.env.LIGHTHOUSE_TIMEOUT_MS ?? 45_000);

/**
 * The runner is copied into the deployment by `outputFileTracingIncludes`.
 * Where it lands depends on the host, so try every plausible root instead of
 * trusting `process.cwd()` alone.
 */
export function runnerCandidates(): string[] {
  const roots = new Set<string>([process.cwd()]);
  // Serverless bundles usually run from /var/task; Next may also keep the file
  // next to the route output.
  roots.add("/var/task");
  roots.add(path.join(process.cwd(), ".next", "server"));
  return [...roots].map((root) => path.join(root, "scripts", "lighthouse-runner.mjs"));
}

export function findRunner(): string | null {
  for (const candidate of runnerCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

type RunnerPayload = {
  ok?: boolean;
  error?: string;
  scores?: Record<string, number | null>;
  metrics?: Record<string, string>;
  chrome?: string;
};

function parsePayload(stdout: string): RunnerPayload | null {
  const start = stdout.indexOf(BEGIN);
  const end = stdout.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  const raw = stdout.slice(start + BEGIN.length, end).trim();
  try {
    return JSON.parse(raw) as RunnerPayload;
  } catch {
    return null;
  }
}

function failure(error: string, chrome: string | null = null): LocalLighthouseResult {
  return { categories: EMPTY, metrics: {}, ok: false, error, chrome };
}

/**
 * Runs Lighthouse in a child process.
 *
 * Chrome resolution (inside the runner): CHROME_PATH → packaged
 * @sparticuz/chromium on Linux/serverless → locally installed Chrome. That means
 * the same code produces real Lighthouse data on a laptop, in Docker and on
 * Vercel, with no Google Cloud account and no API key anywhere.
 */
export async function runLocalLighthouse(url: string): Promise<LocalLighthouseResult> {
  if (process.env.DISABLE_LOCAL_LIGHTHOUSE === "1") {
    return failure("Local Lighthouse is disabled (DISABLE_LOCAL_LIGHTHOUSE=1).");
  }

  const runner = findRunner();
  if (!runner) {
    return failure(
      `The Lighthouse runner is missing from this deployment (looked in ${runnerCandidates().join(", ")}). ` +
        "outputFileTracingIncludes did not copy scripts/lighthouse-runner.mjs."
    );
  }

  const proxy = await resolveProxy();
  const args = [runner, url];
  if (proxy) args.push(`--proxy=${proxy.url}`);

  return new Promise<LocalLighthouseResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result: LocalLighthouseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish(
        failure(
          `Lighthouse timed out after ${Math.round(TIMEOUT_MS / 1000)}s. The page is probably too slow or blocking the headless browser.`
        )
      );
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: Error) => {
      finish(failure(`Could not start the Lighthouse runner: ${err.message}`));
    });

    child.on("close", () => {
      const payload = parsePayload(stdout);

      if (!payload) {
        const hint = stderr.trim().split("\n").slice(-6).join(" ").slice(0, 800);
        finish(
          failure(
            hint
              ? `Lighthouse produced no result (${hint}).`
              : "Lighthouse produced no result — no usable Chrome build was found."
          )
        );
        return;
      }

      if (!payload.ok) {
        finish(failure(payload.error ?? "Lighthouse failed.", payload.chrome ?? null));
        return;
      }

      const scores = payload.scores ?? {};
      const categories: CategoryScore[] = [
        { key: "performance", label: "Performance", score: scores.performance ?? null },
        { key: "accessibility", label: "Accessibility", score: scores.accessibility ?? null },
        { key: "seo", label: "SEO", score: scores.seo ?? null },
        { key: "best-practices", label: "Best Practices", score: scores["best-practices"] ?? null },
      ];

      const measured = categories.some((c) => c.score !== null);
      finish({
        categories,
        metrics: payload.metrics ?? {},
        ok: measured,
        error: measured ? null : "Lighthouse ran but returned no category scores for this URL.",
        chrome: payload.chrome ?? null,
      });
    });
  });
}
