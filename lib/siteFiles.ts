import { fetchWithProxy } from "./http";

export interface SiteFilesResult {
  sitemap: boolean;
  robots: boolean;
  robotsHasSitemap: boolean;
  /** True when at least one of the two requests actually got a response. */
  reachable: boolean;
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetchWithProxy(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; PagePulseBot/0.1)" },
      directTimeoutMs: 8000,
      proxyTimeoutMs: 15000,
    });
    return { ok: res.ok, status: res.status, text: res.body };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

export async function checkSiteFiles(finalUrl: string): Promise<SiteFilesResult> {
  try {
    const origin = new URL(finalUrl).origin;
    const [sitemap, robots] = await Promise.all([
      fetchText(`${origin}/sitemap.xml`),
      fetchText(`${origin}/robots.txt`),
    ]);
    return {
      sitemap: sitemap.ok,
      robots: robots.ok,
      robotsHasSitemap: /sitemap\s*:/i.test(robots.text),
      reachable: sitemap.status > 0 || robots.status > 0,
    };
  } catch {
    return { sitemap: false, robots: false, robotsHasSitemap: false, reachable: false };
  }
}
