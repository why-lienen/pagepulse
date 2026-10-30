import { fetchSite } from "./fetchSite";
import { analyzeHtml } from "./checks";
import { checkSiteFiles } from "./siteFiles";
import { collectPerformance } from "./perf";
import { computeOverall, gradeFromScore, sortIssues } from "./score";
import { aiConfigured, generateSummary } from "./ai";
import { buildProposalBlurb } from "./proposal";
import type { AuditReport, AuditStage, Issue } from "./types";

export async function runAudit(
  url: string,
  onStage: (stage: AuditStage) => void = () => {}
): Promise<AuditReport> {
  onStage("fetch");

  // Lighthouse is slow (10-40s), so start it immediately and let it run while we
  // fetch and analyse the page instead of waiting for the fetch to finish.
  const perfPromise = collectPerformance(url);

  const site = await fetchSite(url);

  if (!site.html || site.html.trim().length === 0) {
    throw new Error("The page returned an empty response.");
  }

  onStage("rules");
  const { issues, meta } = analyzeHtml(site.html, site.finalUrl, site.headers, site.status);

  onStage("lighthouse");
  const [files, psi] = await Promise.all([checkSiteFiles(site.finalUrl), perfPromise]);

  const extra: Issue[] = [];
  // Only report these when the origin actually answered — otherwise a blocked
  // network would produce false "missing sitemap" findings.
  if (files.reachable && !files.sitemap) {
    extra.push({
      id: "sitemap-missing",
      category: "seo",
      severity: "warning",
      title: "No sitemap.xml found",
      detail: "Search engines rely on a sitemap to discover and prioritise pages.",
      fix: "Generate /sitemap.xml and reference it from robots.txt.",
    });
  }
  if (files.reachable && !files.robots) {
    extra.push({
      id: "robots-missing",
      category: "seo",
      severity: "info",
      title: "No robots.txt found",
      detail: "robots.txt is missing, so crawl directives cannot be communicated.",
      fix: "Add /robots.txt with a `Sitemap:` directive.",
    });
  } else if (files.reachable && files.robots && !files.robotsHasSitemap) {
    extra.push({
      id: "robots-no-sitemap",
      category: "seo",
      severity: "info",
      title: "robots.txt does not reference a sitemap",
      detail: "Pointing robots.txt at the sitemap improves discovery speed.",
      fix: "Add `Sitemap: https://your-domain.com/sitemap.xml` to robots.txt.",
    });
  }

  const allIssues = sortIssues([...issues, ...extra]);
  const categories = psi.categories;
  const measured = categories.some((c) => c.score !== null);
  const overall = computeOverall(categories, allIssues);

  const base = {
    url,
    finalUrl: site.finalUrl,
    fetchedAt: new Date().toISOString(),
    overall,
    grade: gradeFromScore(overall),
    scoreBasis: measured ? ("lighthouse" as const) : ("rules" as const),
    lighthouseError: psi.ok ? null : psi.error,
    perfSource: psi.source,
    perfNote: psi.note,
    categories,
    issues: allIssues,
    meta,
    metrics: psi.metrics,
    proposal: buildProposalBlurb(site.finalUrl, allIssues),
  };

  const enabled = aiConfigured();
  onStage("ai");
  const ai = enabled ? await generateSummary(base) : null;

  onStage("done");
  return { ...base, ai, aiEnabled: enabled };
}
