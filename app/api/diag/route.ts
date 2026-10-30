import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { findRunner, runnerCandidates, runLocalLighthouse } from "@/lib/lighthouseLocal";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function has(moduleName: string): boolean {
  const roots = [process.cwd(), "/var/task", path.join(process.cwd(), ".next", "server")];
  return roots.some((root) => existsSync(path.join(root, "node_modules", moduleName, "package.json")));
}

function listDir(dir: string): string[] | null {
  try {
    return readdirSync(dir).slice(0, 40);
  } catch {
    return null;
  }
}

/**
 * Temporary self-diagnosis endpoint for serverless deployments. Reports where
 * the Lighthouse runner landed and, with ?run=1, actually executes it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldRun = url.searchParams.get("run") === "1";
  const target = url.searchParams.get("url") ?? "https://example.com/";

  const info: Record<string, unknown> = {
    node: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    vercel: Boolean(process.env.VERCEL),
    runner: {
      candidates: runnerCandidates(),
      found: findRunner(),
    },
    scriptsDir: listDir(path.join(process.cwd(), "scripts")),
    varTaskScripts: listDir("/var/task/scripts"),
    modules: {
      lighthouse: has("lighthouse"),
      chromeLauncher: has("chrome-launcher"),
      sparticuz: has("@sparticuz/chromium"),
      undici: has("undici"),
    },
    env: {
      disableLocal: process.env.DISABLE_LOCAL_LIGHTHOUSE ?? null,
      provider: process.env.PERF_PROVIDER ?? null,
      timeout: process.env.LIGHTHOUSE_TIMEOUT_MS ?? null,
      chromePath: process.env.CHROME_PATH ?? null,
    },
  };

  if (shouldRun) {
    const started = Date.now();
    try {
      const result = await runLocalLighthouse(target);
      info.run = {
        ok: result.ok,
        error: result.error,
        chrome: result.chrome,
        scores: result.categories,
        metrics: result.metrics,
        ms: Date.now() - started,
      };
    } catch (err) {
      info.run = {
        ok: false,
        error: err instanceof Error ? err.stack ?? err.message : String(err),
        ms: Date.now() - started,
      };
    }
  }

  return NextResponse.json(info, { headers: { "cache-control": "no-store" } });
}
