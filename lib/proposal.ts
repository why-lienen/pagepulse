import type { Issue } from "./types";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[.:;]+$/, "").trim();
}

/**
 * Deterministic, AI-free proposal snippet built from the strongest findings.
 * Used whenever no AI key is configured so the "Copy for proposal" feature
 * still works out of the box.
 */
export function buildProposalBlurb(finalUrl: string, issues: Issue[]): string {
  const site = hostOf(finalUrl);
  const top = issues.filter((i) => i.severity !== "pass").slice(0, 3);

  if (top.length === 0) {
    return `I ran a technical audit on ${site} — no blocking issues, the site is in good shape. I can still help with performance tuning, SEO structure or new features. Happy to share the full report.`;
  }

  const listed = top.map((i) => `• ${clean(i.title)}`).join("\n");
  const fixes = top.map((i, idx) => `${idx + 1}. ${clean(i.fix)}.`).join("\n");

  return `I ran a technical audit on ${site} and found ${
    top.length === 1 ? "one issue" : `${top.length} issues`
  } holding it back:

${listed}

Here is exactly how I would fix them:
${fixes}

I can start this week and deliver in a few days — happy to send the full report and a fixed quote.`;
}
