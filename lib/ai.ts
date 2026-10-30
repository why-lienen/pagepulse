import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { resolveProxy } from "./proxy";
import type { AiSummary, AuditReport } from "./types";

type ReportBase = Omit<AuditReport, "ai" | "aiEnabled">;

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

function resolveEndpoint() {
  const provider = (process.env.AI_PROVIDER || "deepseek").toLowerCase();
  const baseUrl =
    process.env.AI_BASE_URL ||
    (provider === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com");
  const model =
    process.env.AI_MODEL || (provider === "openai" ? "gpt-4o-mini" : "deepseek-chat");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model };
}

export async function generateSummary(report: ReportBase): Promise<AiSummary | null> {
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  const { baseUrl, model } = resolveEndpoint();

  const findings = {
    url: report.finalUrl,
    overall: report.overall,
    grade: report.grade,
    categories: report.categories,
    metrics: report.metrics,
    meta: report.meta,
    issues: report.issues.map((i) => ({
      severity: i.severity,
      category: i.category,
      title: i.title,
      detail: i.detail,
    })),
  };

  const system =
    "You are a senior web consultant who audits websites for performance, SEO, security and conversion. Reply with STRICT JSON only, no markdown.";

  const user = `Audit findings:
${JSON.stringify(findings)}

Return JSON with exactly this shape:
{
  "headline": "one-sentence verdict on the site",
  "topIssues": [{"title": "short issue name", "why": "why it matters, 1-2 sentences", "fix": "concrete fix"}],
  "quickWins": ["short actionable item", "..."],
  "proposalBlurb": "2-3 sentences in English that a freelancer can paste into a client proposal, proving they audited the site and naming specific fixes they would deliver"
}
Rules: topIssues max 4 and ordered by impact; quickWins max 4; be specific and reference the actual findings.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const payload = JSON.stringify({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  type LlmResponse = { choices?: { message?: { content?: string } }[] };

  const callLlm = async (dispatcher?: Dispatcher): Promise<LlmResponse> => {
    const res = await undiciFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      dispatcher,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: payload,
    });
    if (!res.ok) throw new Error(`LLM API ${res.status}`);
    return (await res.json()) as LlmResponse;
  };

  try {
    let data: LlmResponse;
    try {
      // DeepSeek / domestic endpoints are reachable directly — try that first.
      data = await callLlm();
    } catch {
      // OpenAI and friends may need the same proxy the PageSpeed call uses.
      const proxy = await resolveProxy();
      if (!proxy) return null;
      data = await callLlm(new ProxyAgent(proxy.url));
    }

    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      headline: String(parsed.headline ?? "").slice(0, 300),
      topIssues: Array.isArray(parsed.topIssues)
        ? parsed.topIssues.slice(0, 4).map((x: Record<string, unknown>) => ({
            title: String(x.title ?? ""),
            why: String(x.why ?? ""),
            fix: String(x.fix ?? ""),
          }))
        : [],
      quickWins: Array.isArray(parsed.quickWins)
        ? parsed.quickWins.slice(0, 4).map((x: unknown) => String(x))
        : [],
      proposalBlurb: String(parsed.proposalBlurb ?? "").slice(0, 800),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
