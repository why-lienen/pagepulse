export type Severity = "critical" | "warning" | "info" | "pass";

export type CategoryKey =
  | "seo"
  | "performance"
  | "accessibility"
  | "best-practices"
  | "security"
  | "content"
  | "mobile";

export interface Issue {
  id: string;
  category: CategoryKey;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

export interface CategoryScore {
  key: "performance" | "accessibility" | "seo" | "best-practices";
  label: string;
  /** 0-100, or null when the metric could not be measured */
  score: number | null;
}

export interface MetaInfo {
  title: string | null;
  description: string | null;
  h1Count: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  htmlBytes: number;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
  hasCanonical: boolean;
  hasViewport: boolean;
  lang: string | null;
  https: boolean;
  server: string | null;
  statusCode: number;
}

export interface AiSummary {
  headline: string;
  topIssues: { title: string; why: string; fix: string }[];
  quickWins: string[];
  proposalBlurb: string;
}

/** How the overall score was derived. */
export type ScoreBasis = "lighthouse" | "rules";

/** Progress milestones reported to the client while an audit runs. */
export type AuditStage = "fetch" | "rules" | "lighthouse" | "ai" | "done";

export interface AuditReport {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  overall: number;
  grade: string;
  /** "lighthouse" = averaged from real PageSpeed scores; "rules" = estimated from rule checks only */
  scoreBasis: ScoreBasis;
  /** Human-readable reason the Lighthouse scores are missing, null when they are present */
  lighthouseError: string | null;
  /** Where the four scores came from: Google's API or a local Lighthouse run */
  perfSource: "pagespeed" | "local-lighthouse" | null;
  /** One-line explanation of how the scores were measured */
  perfNote: string | null;
  categories: CategoryScore[];
  issues: Issue[];
  meta: MetaInfo;
  metrics: Record<string, string>;
  /** Rule-based proposal blurb, always available (no AI key needed) */
  proposal: string;
  ai: AiSummary | null;
  aiEnabled: boolean;
}
