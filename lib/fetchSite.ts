import { fetchWithProxy } from "./http";

export interface FetchedSite {
  finalUrl: string;
  status: number;
  headers: Headers;
  html: string;
  /** "direct" or "proxy http://127.0.0.1:7897" — useful for debugging */
  via: string;
}

const UA =
  "Mozilla/5.0 (compatible; PagePulseBot/0.1; +https://github.com/) AppleWebKit/537.36";

const REQUEST_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

export async function fetchSite(url: string): Promise<FetchedSite> {
  let result;
  try {
    result = await fetchWithProxy(url, {
      headers: REQUEST_HEADERS,
      directTimeoutMs: 12000,
      proxyTimeoutMs: 30000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/TimeoutError|UND_ERR_CONNECT_TIMEOUT|The operation was aborted/i.test(message)) {
      throw new Error(
        "The site did not respond in time — it may be very slow, blocking bots, or unreachable from this network."
      );
    }
    throw new Error(message);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    headers.set(key, value);
  }

  return {
    finalUrl: result.finalUrl,
    status: result.status,
    headers,
    html: result.body,
    via: result.via,
  };
}
