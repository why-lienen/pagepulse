import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The Lighthouse runner is spawned as a child process, so Next's file tracer
 * cannot see what it imports. We walk Lighthouse's own dependency tree and tell
 * `outputFileTracingIncludes` to copy every package it needs.
 *
 * Without this the deployment ships `scripts/lighthouse-runner.mjs` but none of
 * its imports, and the runner dies with ERR_MODULE_NOT_FOUND on Vercel/Lambda.
 *
 * `@sentry/*` and `zod` are skipped on purpose: Sentry is only required by the
 * Lighthouse *CLI* error reporter. The Node API (`import lighthouse`) never
 * touches it — verified by removing the package and running a full audit, which
 * still returned 100/96/80/100. Dropping it saves ~89 MB against the 250 MB
 * serverless function limit.
 */
const SKIP = [/^@sentry\//, /^@sentry-internal\//, /^zod$/];

function runtimeDependencies(roots) {
  const seen = new Set();
  const root = path.join(process.cwd(), "node_modules");

  const walk = (name) => {
    if (seen.has(name) || SKIP.some((re) => re.test(name))) return;
    const manifest = path.join(root, name, "package.json");
    if (!existsSync(manifest)) return;
    seen.add(name);
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(manifest, "utf8"));
    } catch {
      return;
    }
    for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep);
  };

  roots.forEach(walk);
  return [...seen];
}

const lighthouseDeps = runtimeDependencies([
  "lighthouse",
  "chrome-launcher",
  "@sparticuz/chromium",
]);

const traceIncludes = [
  "./scripts/lighthouse-runner.mjs",
  ...lighthouseDeps.map((name) => `./node_modules/${name}/**`),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets `NEXT_DIST_DIR=.next-build npm run build` run next to a live dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Tracing the bundled Chromium + Lighthouse takes a while on a cold build, so
  // the default 60 s per-page budget is not enough on slower machines or CI.
  staticPageGenerationTimeout: 300,
  experimental: {
    outputFileTracingIncludes: {
      "/api/audit": traceIncludes,
      "/api/diag": traceIncludes,
    },
  },
};

export default nextConfig;
