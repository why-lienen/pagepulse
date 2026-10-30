#!/usr/bin/env node
/**
 * Standalone Lighthouse runner used by lib/lighthouseLocal.ts.
 *
 * Lives in its own process on purpose:
 *   - Lighthouse is a huge CJS bundle with dynamic requires — importing it inside
 *     Next.js makes webpack unhappy and bloats the server build.
 *   - A crash or hang here cannot take down the API route, and the parent can
 *     enforce a hard timeout by killing the child.
 *
 * Chrome resolution order:
 *   1. CHROME_PATH                — explicit binary (local dev, Docker with Chrome)
 *   2. @sparticuz/chromium        — packaged headless build for Linux/serverless
 *                                   (Vercel, AWS Lambda, Netlify). No API key.
 *   3. chrome-launcher autodetect — whatever Chrome/Chromium/Edge is installed
 *
 * Usage:  node scripts/lighthouse-runner.mjs <url> [--proxy=http://127.0.0.1:7897]
 * Output: one JSON object between the __LH_BEGIN__ / __LH_END__ markers.
 */

import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const BEGIN = "__LH_BEGIN__";
const END = "__LH_END__";

function emit(payload) {
  process.stdout.write(`\n${BEGIN}\n${JSON.stringify(payload)}\n${END}\n`);
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const proxyArg = args.find((a) => a.startsWith("--proxy="));
const proxy = proxyArg ? proxyArg.slice("--proxy=".length) : null;

if (!target) {
  emit({ ok: false, error: "No URL supplied to the Lighthouse runner." });
  process.exit(0);
}

const categoriesArg = args.find((a) => a.startsWith("--cats="));
const ALL_CATEGORIES = ["performance", "accessibility", "seo", "best-practices"];
const categories = categoriesArg
  ? categoriesArg
      .slice("--cats=".length)
      .split(",")
      .map((c) => c.trim())
      .filter((c) => ALL_CATEGORIES.includes(c))
  : ALL_CATEGORIES;

const COMMON_FLAGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
];

if (proxy) {
  COMMON_FLAGS.push(`--proxy-server=${proxy}`, "--proxy-bypass-list=<-loopback>");
}

/** Was this process started by `next start` / a serverless function? */
function wantsPackagedChrome() {
  if (process.env.FORCE_PACKAGED_CHROME === "1") return true;
  if (process.env.CHROME_PATH) return false;
  return process.platform === "linux";
}

async function launchChrome() {
  const attempts = [];

  if (process.env.CHROME_PATH) {
    attempts.push({
      label: `CHROME_PATH ${process.env.CHROME_PATH}`,
      chromePath: process.env.CHROME_PATH,
      chromeFlags: ["--headless=new"],
    });
  }

  if (wantsPackagedChrome()) {
    attempts.push({
      label: "packaged @sparticuz/chromium (headless shell)",
      getChromePath: async () => {
        const { default: chromium } = await import("@sparticuz/chromium");
        // --single-process and --no-zygote are fine for simple scraping but make
        // Lighthouse's multi-tab navigation flaky, so they are dropped. The
        // packaged build is a headless shell: it must not receive --headless=new.
        const packagedFlags = chromium.args.filter(
          (flag) =>
            !flag.startsWith("--headless") &&
            flag !== "--single-process" &&
            flag !== "--no-zygote"
        );
        return { chromePath: await chromium.executablePath(), chromeFlags: packagedFlags };
      },
    });
  }

  // Auto-detect whatever is installed locally.
  attempts.push({
    label: "local Chrome (auto-detected)",
    chromeFlags: ["--headless=new"],
  });

  const failures = [];

  for (const attempt of attempts) {
    try {
      const resolved = attempt.getChromePath ? await attempt.getChromePath() : attempt;
      const chrome = await chromeLauncher.launch({
        chromePath: resolved.chromePath,
        chromeFlags: [...(resolved.chromeFlags ?? []), ...COMMON_FLAGS],
      });
      return { chrome, label: attempt.label };
    } catch (err) {
      failures.push(`${attempt.label}: ${(err && err.message) || String(err)}`);
    }
  }

  throw new Error(`Could not launch any Chrome build — ${failures.join(" | ")}`);
}

const throttlingArg = args.find((a) => a.startsWith("--throttling="));
const throttlingMethod = throttlingArg ? throttlingArg.slice("--throttling=".length) : "simulate";

let chrome = null;
const startedAt = Date.now();

try {
  const launched = await launchChrome();
  chrome = launched.chrome;
  const launchMs = Date.now() - startedAt;

  // Diagnostics: report how long it took to unpack and launch the browser, then
  // stop. Useful when a serverless function is killed before Lighthouse finishes.
  if (args.includes("--step=chrome")) {
    emit({ ok: true, chrome: launched.label, launchMs, mode: "chrome-only" });
    await chrome.kill();
    process.exit(0);
  }

  // Diagnostics: navigate with puppeteer and collect Core Web Vitals directly.
  // Tells apart "the browser or network is broken" from "Lighthouse hangs".
  if (args.includes("--step=nav") || args.includes("--step=cwv")) {
    const stepStarted = Date.now();
    try {
      const { default: puppeteer } = await import("puppeteer-core");
      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${chrome.port}`,
        defaultViewport: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
      });
      const page = await browser.newPage();
      const navStart = Date.now();
      const response = await page.goto(target, { waitUntil: "load", timeout: 45_000 });
      const navMs = Date.now() - navStart;

      const vitals = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out = { lcp: 0, cls: 0, fcp: 0, tbt: 0, lcpElement: null };
            try {
              const fcp = performance.getEntriesByName("first-contentful-paint")[0];
              if (fcp) out.fcp = Math.round(fcp.startTime);
              const nav = performance.getEntriesByType("navigation")[0];
              if (nav) out.ttfb = Math.round(nav.responseStart);
            } catch {
              /* ignore */
            }
            try {
              new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const last = entries[entries.length - 1];
                if (last) {
                  out.lcp = Math.round(last.startTime);
                  out.lcpElement = last.element ? last.element.tagName : null;
                }
              }).observe({ type: "largest-contentful-paint", buffered: true });
            } catch {
              /* ignore */
            }
            try {
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) out.cls = Math.round((out.cls + entry.value) * 1000) / 1000;
                }
              }).observe({ type: "layout-shift", buffered: true });
            } catch {
              /* ignore */
            }
            try {
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  out.tbt += Math.max(0, entry.duration - 50);
                }
                out.tbt = Math.round(out.tbt);
              }).observe({ type: "longtask", buffered: true });
            } catch {
              /* ignore */
            }
            setTimeout(() => resolve(out), 3000);
          })
      );

      emit({
        ok: true,
        chrome: launched.label,
        status: response ? response.status() : null,
        navMs,
        vitals,
        totalMs: Date.now() - stepStarted,
      });
      await browser.disconnect();
    } catch (err) {
      emit({ ok: false, error: (err && err.message) || String(err), totalMs: Date.now() - stepStarted });
    }
    await chrome.kill();
    process.exit(0);
  }

  const runnerResult = await lighthouse(
    target,
    {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: categories,
      formFactor: "mobile",
      throttlingMethod,
    },
    undefined
  );

  const lhr = runnerResult?.lhr;
  if (!lhr) {
    emit({ ok: false, error: "Lighthouse returned no result for this URL.", chrome: launched.label });
  } else {
    const scores = {};
    for (const key of categories) {
      const score = lhr.categories?.[key]?.score;
      scores[key] = typeof score === "number" ? Math.round(score * 100) : null;
    }

    const metricMap = {
      LCP: "largest-contentful-paint",
      CLS: "cumulative-layout-shift",
      TBT: "total-blocking-time",
      FCP: "first-contentful-paint",
      "Speed Index": "speed-index",
    };

    const metrics = {};
    for (const [label, auditId] of Object.entries(metricMap)) {
      const displayValue = lhr.audits?.[auditId]?.displayValue;
      if (typeof displayValue === "string") metrics[label] = displayValue;
    }

    emit({
      ok: true,
      scores,
      metrics,
      chrome: launched.label,
      finalUrl: lhr.finalDisplayedUrl ?? target,
    });
  }
} catch (err) {
  emit({ ok: false, error: (err && err.message) || String(err) });
} finally {
  if (chrome) {
    try {
      await chrome.kill();
    } catch {
      /* the sandbox may block temp cleanup — harmless */
    }
  }
  process.exit(0);
}
