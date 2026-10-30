import { fetchPageSpeed, type PageSpeedResult } from "./pagespeed";
import { runLocalLighthouse, type LocalLighthouseResult } from "./lighthouseLocal";
import type { CategoryScore } from "./types";

export type PerfSource = "pagespeed" | "local-lighthouse" | null;

export interface PerfResult {
  categories: CategoryScore[];
  metrics: Record<string, string>;
  ok: boolean;
  error: string | null;
  source: PerfSource;
  /** Short human-readable note about how the numbers were obtained */
  note: string | null;
}

function localNote(chrome: string | null): string {
  const build = chrome ? ` (${chrome})` : "";
  return `Measured with a real headless Chrome running Google Lighthouse${build}, mobile emulation. Lab data, not an estimate.`;
}

function fromPsi(psi: PageSpeedResult): PerfResult {
  return {
    categories: psi.categories,
    metrics: psi.metrics,
    ok: psi.ok,
    error: psi.error,
    source: psi.ok ? "pagespeed" : null,
    note: psi.ok ? "Measured by Google PageSpeed Insights (mobile)." : null,
  };
}

function fromLocal(local: LocalLighthouseResult, fallbackNote: string | null): PerfResult {
  return {
    categories: local.categories,
    metrics: local.metrics,
    ok: local.ok,
    error: local.error,
    source: local.ok ? "local-lighthouse" : null,
    note: local.ok ? fallbackNote ?? localNote(local.chrome) : null,
  };
}

/**
 * Gets the four Lighthouse scores.
 *
 * Everything runs on our own Chrome now — @sparticuz/chromium on Linux/serverless,
 * the installed Chrome on a laptop — so no visitor ever needs to supply a Google
 * API key. The PageSpeed API is used only when a key happens to be configured,
 * because it is cheaper than booting a browser.
 *
 *   PERF_PROVIDER=local      → local Lighthouse only (falls back to API if a key exists)
 *   PERF_PROVIDER=pagespeed  → API only (falls back to local Chrome)
 *   unset                    → API when a key exists, otherwise local
 */
export async function collectPerformance(url: string): Promise<PerfResult> {
  const provider = process.env.PERF_PROVIDER;
  const hasKey = Boolean(process.env.PAGESPEED_API_KEY);
  const localOff = process.env.DISABLE_LOCAL_LIGHTHOUSE === "1";

  const useLocal = async (note?: string | null): Promise<PerfResult> =>
    fromLocal(await runLocalLighthouse(url), note ?? null);

  const useApi = async (): Promise<PerfResult> => fromPsi(await fetchPageSpeed(url));

  /**
   * When both engines fail we must not hide the local reason behind the Google
   * error: "local Lighthouse could not launch Chrome" is the actionable one.
   */
  const bothFailed = (local: PerfResult, api: PerfResult): PerfResult => ({
    ...api,
    error: [local.error, api.error ? `PageSpeed fallback also failed: ${api.error}` : null]
      .filter(Boolean)
      .join(" "),
  });

  if (provider === "pagespeed") {
    const api = await useApi();
    return api.ok || localOff ? api : useLocal();
  }

  if (provider === "local") {
    if (localOff) return useApi();
    const local = await useLocal();
    if (local.ok || !hasKey) return local;
    const api = await useApi();
    return api.ok ? api : bothFailed(local, api);
  }

  if (hasKey) {
    const api = await useApi();
    if (api.ok || localOff) return api;
    return useLocal("PageSpeed Insights was unreachable, so Lighthouse ran in a headless Chrome instead.");
  }

  if (localOff) return useApi();

  const local = await useLocal();
  if (local.ok) return local;
  return bothFailed(local, await useApi());
}
