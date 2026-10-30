// Standalone smoke test for the audit engine (no Next.js required).
// Run:  node --experimental-strip-types scripts/smoke.ts
import { analyzeHtml } from "../lib/checks.ts";
import { computeOverall, gradeFromScore } from "../lib/score.ts";
import type { CategoryScore } from "../lib/types.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

// --- Case 1: a page missing viewport, alt text, structured data, security headers ---
const html1 = `<!doctype html><html lang="en"><head>
<title>Test page for the audit engine</title>
<meta name="description" content="short">
</head><body><h1>Hello</h1><img src="/a.png"><img src="/b.png" alt="ok"></body></html>`;

const headers1 = new Headers({ "content-type": "text/html" });
const r1 = analyzeHtml(html1, "https://example.com/", headers1, 200);

assert(r1.meta.title === "Test page for the audit engine", "title parsed");
assert(r1.meta.h1Count === 1, "h1 count");
assert(r1.meta.imagesTotal === 2, "image count");
assert(r1.meta.imagesMissingAlt === 1, "alt detection");
assert(r1.meta.hasViewport === false, "viewport missing detected");
assert(r1.meta.https === true, "https detected");
assert(r1.meta.hasStructuredData === false, "structured data missing detected");

const ids1 = r1.issues.map((i) => i.id);
assert(ids1.includes("viewport-missing"), "flags missing viewport");
assert(ids1.includes("structured-data-missing"), "flags missing JSON-LD");
assert(ids1.includes("hsts"), "flags missing HSTS");
assert(ids1.includes("canonical-missing"), "flags missing canonical");

// --- Case 2: a healthy page should produce far fewer issues ---
const html2 = `<!doctype html><html lang="en"><head>
<title>A perfectly reasonable page title here</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${"x".repeat(80)}">
<meta property="og:title" content="Hi"><link rel="canonical" href="https://example.com/">
<script type="application/ld+json">{"@type":"WebSite"}</script>
</head><body><h1>Hello</h1></body></html>`;

const healthy = new Headers({
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
});
const r2 = analyzeHtml(html2, "https://example.com/", healthy, 200);
assert(r2.issues.length < r1.issues.length, "healthy page has fewer issues");

// --- Case 3: scoring / grading ---
const cats: CategoryScore[] = [
  { key: "performance", label: "Performance", score: 95 },
  { key: "accessibility", label: "Accessibility", score: 95 },
  { key: "seo", label: "SEO", score: 95 },
  { key: "best-practices", label: "Best Practices", score: 95 },
];
const good = computeOverall(cats, []);
assert(good === 95, "no-issue overall equals avg (got " + good + ")");
assert(gradeFromScore(95) === "A", "grade A");
assert(gradeFromScore(72) === "C", "grade C");
assert(gradeFromScore(40) === "F", "grade F");

const bad = computeOverall(cats, [
  { id: "a", category: "seo", severity: "critical", title: "", detail: "", fix: "" },
  { id: "b", category: "seo", severity: "critical", title: "", detail: "", fix: "" },
]);
assert(bad < good, "critical issues lower the score");

console.log("Case 1 issues:", r1.issues.length, "| Case 2 issues:", r2.issues.length);
console.log("overall(clean, 95s):", good, "→", gradeFromScore(good), "| with 2 criticals:", bad);
console.log("SMOKE OK ✓");
