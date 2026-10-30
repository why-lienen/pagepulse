import type { CategoryScore, Issue } from "./types";

export function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function computeOverall(categories: CategoryScore[], issues: Issue[]): number {
  const scored = categories
    .filter((c) => c.score !== null)
    .map((c) => c.score as number);
  const base = scored.length
    ? scored.reduce((a, b) => a + b, 0) / scored.length
    : 72;

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;
  const penalty = Math.min(critical * 4 + warning * 1.5, 40);

  return Math.max(0, Math.min(100, Math.round(base - penalty)));
}

export const severityOrder: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  pass: 3,
};

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );
}
