import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { resolveProxy } from "./proxy";

export interface HttpClientResult {
  body: string;
  status: number;
  ok: boolean;
  finalUrl: string;
  /** Lower-cased response headers. */
  headers: Record<string, string>;
  /** How the request was made: "direct" or "proxy http://127.0.0.1:7897". */
  via: string;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  directTimeoutMs?: number;
  proxyTimeoutMs?: number;
}

/**
 * Fetch a URL, falling back to a local proxy when the direct connection fails.
 * Node's fetch does not use the OS proxy, so sites reachable from a browser can
 * still fail here without this fallback.
 */
export async function fetchWithProxy(url: string, options: FetchOptions = {}): Promise<HttpClientResult> {
  const { headers = {}, directTimeoutMs = 12000, proxyTimeoutMs = 30000 } = options;

  const attempts: { label: string; dispatcher?: Dispatcher; timeout: number }[] = [
    { label: "direct", timeout: directTimeoutMs },
  ];

  const proxy = await resolveProxy();
  if (proxy) {
    attempts.push({
      label: `proxy ${proxy.url}`,
      dispatcher: new ProxyAgent(proxy.url),
      timeout: proxyTimeoutMs,
    });
  }

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const res = await undiciFetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(attempt.timeout),
        headers,
        dispatcher: attempt.dispatcher,
      });
      const body = await res.text();
      const flat: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        flat[key.toLowerCase()] = value;
      });
      return { body, status: res.status, ok: res.ok, finalUrl: res.url || url, headers: flat, via: attempt.label };
    } catch (err) {
      const code =
        (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name ?? "request failed";
      failures.push(`${attempt.label}: ${code}`);
    }
  }

  throw new Error(`Could not load ${url} — ${failures.join("; ")}`);
}
