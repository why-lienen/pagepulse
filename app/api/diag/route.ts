import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findRunner, runnerCandidates, runLocalLighthouse } from "@/lib/lighthouseLocal";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function pkgDirs(): string[] {
  return [path.join(process.cwd(), "node_modules"), "/var/task/node_modules", path.join(process.cwd(), ".next", "server", "node_modules")];
}

function readPkg(name: string): Record<string, unknown> | null {
  for (const dir of pkgDirs()) {
    const file = path.join(dir, name, "package.json");
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

/** Walks the dependency tree the same way Node resolves it, and reports what is missing. */
function dependencyReport(roots: string[]) {
  const status = new Map<string, "ok" | "missing">();
  const walk = (name: string) => {
    if (status.has(name)) return;
    const pkg = readPkg(name);
    if (!pkg) {
      status.set(name, "missing");
      return;
    }
    status.set(name, "ok");
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    for (const dep of Object.keys(deps)) walk(dep);
  };
  for (const root of roots) walk(root);

  const ok = [...status].filter(([, v]) => v === "ok").map(([k]) => k);
  const missing = [...status].filter(([, v]) => v === "missing").map(([k]) => k);
  return { okCount: ok.length, missing };
}

function runRaw(
  url: string,
  extraArgs: string[] = []
): Promise<{ stdout: string; stderr: string; code: number | null; ms: number }> {
  const runner = findRunner();
  if (!runner) {
    return Promise.resolve({ stdout: "", stderr: "runner not found", code: null, ms: 0 });
  }
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(process.execPath, [runner, url, ...extraArgs], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
    }, 45_000);
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, 4000),
        stderr: stderr.slice(0, 4000),
        code,
        ms: Date.now() - started,
      });
    });
  });
}

/**
 * Splits the runner into its two expensive halves so a timeout can be pinned on
 * Chromium unpacking/launching versus Lighthouse itself.
 */
/**
 * Temporary self-diagnosis endpoint for serverless deployments. Reports where
 * the Lighthouse runner landed and, with ?run=1, actually executes it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldRun = url.searchParams.get("run") === "1";
  const raw = url.searchParams.get("raw") === "1";
  const step = url.searchParams.get("step");
  const target = url.searchParams.get("url") ?? "https://example.com/";

  const info: Record<string, unknown> = {
    node: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    vercel: Boolean(process.env.VERCEL),
    runner: { candidates: runnerCandidates(), found: findRunner() },
    scriptsDir: (() => {
      try {
        return readdirSync(path.join(process.cwd(), "scripts")).slice(0, 40);
      } catch {
        return null;
      }
    })(),
    deps: dependencyReport(["lighthouse", "chrome-launcher", "@sparticuz/chromium"]),
    env: {
      disableLocal: process.env.DISABLE_LOCAL_LIGHTHOUSE ?? null,
      provider: process.env.PERF_PROVIDER ?? null,
      timeout: process.env.LIGHTHOUSE_TIMEOUT_MS ?? null,
    },
  };

  if (step === "chrome") {
    info.chromeStep = await runRaw(target, ["--step=chrome"]);
    return NextResponse.json(info, { headers: { "cache-control": "no-store" } });
  }

  if (raw) {
    const out = await runRaw(target);
    info.raw = out;
  } else if (shouldRun) {
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
      info.run = { ok: false, error: err instanceof Error ? err.stack : String(err), ms: Date.now() - started };
    }
  }

  return NextResponse.json(info, { headers: { "cache-control": "no-store" } });
}
