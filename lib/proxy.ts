import net from "node:net";

/**
 * Local ports commonly used by Chinese proxy clients (Clash Verge / ClashX Pro /
 * Surge / V2Ray / Shadowsocks). Detection only runs for local development.
 */
const COMMON_PORTS = [7897, 7890, 7891, 1087, 1080, 6152, 8888, 8080, 10809, 33210];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedProxy: string | null | undefined;
let cachedAt = 0;

function normalize(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  // undici's ProxyAgent speaks HTTP/HTTPS proxies only, not SOCKS.
  if (/^socks/i.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

/** Proxy explicitly configured through environment variables. */
export function envProxy(): { url: string; source: string } | null {
  const keys = ["PSI_PROXY", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const url = normalize(raw);
    if (url) return { url, source: key };
    if (/^socks/i.test(raw)) {
      console.warn(`[proxy] ${key} points at a SOCKS proxy (${raw}); only HTTP proxies are supported — ignoring.`);
    }
  }
  return null;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(350);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** Best-effort scan for a locally running HTTP proxy. Cached for a few minutes. */
export async function detectLocalProxy(): Promise<string | null> {
  if (process.env.PSI_DISABLE_PROXY === "1" || process.env.VERCEL) return null;
  const now = Date.now();
  if (cachedProxy !== undefined && now - cachedAt < CACHE_TTL_MS) return cachedProxy;

  for (const port of COMMON_PORTS) {
    if (await isPortOpen(port)) {
      cachedProxy = `http://127.0.0.1:${port}`;
      cachedAt = now;
      return cachedProxy;
    }
  }
  cachedProxy = null;
  cachedAt = now;
  return null;
}

/**
 * Resolve the proxy to use, preferring explicit configuration over detection.
 * Returns null when no proxy is available (direct connection only).
 */
export async function resolveProxy(): Promise<{ url: string; source: string } | null> {
  const fromEnv = envProxy();
  if (fromEnv) return fromEnv;
  const detected = await detectLocalProxy();
  return detected ? { url: detected, source: "auto-detected" } : null;
}
