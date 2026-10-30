import type { Issue, MetaInfo } from "./types";

function extractMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name && typeof content === "string") {
      out[name.toLowerCase()] = content;
    }
  }
  return out;
}

function checkSecurityHeaders(headers: Headers): Issue[] {
  const out: Issue[] = [];
  const hsts = headers.get("strict-transport-security");
  const xcto = headers.get("x-content-type-options");
  const xfo = headers.get("x-frame-options");
  const csp = headers.get("content-security-policy");
  const referrer = headers.get("referrer-policy");

  if (!hsts) {
    out.push({
      id: "hsts",
      category: "security",
      severity: "warning",
      title: "Missing HSTS header",
      detail:
        "Strict-Transport-Security is not set, so browsers may still attempt an insecure first request.",
      fix: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` at the edge/server.",
    });
  }
  if (!xcto) {
    out.push({
      id: "x-content-type-options",
      category: "security",
      severity: "warning",
      title: "Missing X-Content-Type-Options",
      detail: "Browsers may MIME-sniff responses, which can enable content-type confusion attacks.",
      fix: "Add `X-Content-Type-Options: nosniff`.",
    });
  }
  if (!xfo && !csp) {
    out.push({
      id: "clickjacking",
      category: "security",
      severity: "warning",
      title: "No frame protection (X-Frame-Options / CSP)",
      detail: "The page can be embedded in an iframe by third parties, enabling clickjacking.",
      fix: "Add `X-Frame-Options: SAMEORIGIN` or a Content-Security-Policy with frame-ancestors.",
    });
  }
  if (!referrer) {
    out.push({
      id: "referrer-policy",
      category: "security",
      severity: "info",
      title: "Missing Referrer-Policy",
      detail: "Full URLs may leak to third parties via the Referer header.",
      fix: "Add `Referrer-Policy: strict-origin-when-cross-origin`.",
    });
  }
  return out;
}

export function analyzeHtml(
  html: string,
  finalUrl: string,
  headers: Headers,
  statusCode: number
): { issues: Issue[]; meta: MetaInfo } {
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const metas = extractMeta(html);
  const description = metas["description"] ?? null;
  const h1Count = html.match(/<h1\b/gi)?.length ?? 0;
  const htmlBytes = Buffer.byteLength(html, "utf8");
  const isHttps = finalUrl.startsWith("https://");

  const hasViewport = Boolean(metas["viewport"]);
  const hasOpenGraph = Boolean(metas["og:title"] || metas["og:image"]);
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const lang = /<html[^>]+lang=["']([^"']+)["']/i.exec(html)?.[1] ?? null;

  // --- Title ---
  if (!title) {
    add({
      id: "title-missing",
      category: "seo",
      severity: "critical",
      title: "Missing page title",
      detail: "No <title> tag was found. This is the single most important on-page SEO element.",
      fix: "Add a unique, descriptive <title> of 50–60 characters containing your main keyword.",
    });
  } else {
    const len = title.length;
    if (len < 10) {
      add({
        id: "title-short",
        category: "seo",
        severity: "warning",
        title: "Page title is too short",
        detail: `Title is ${len} characters: "${title}". Short titles waste SERP space.`,
        fix: "Aim for 50–60 characters that describe the page and include the primary keyword.",
      });
    } else if (len > 60) {
      add({
        id: "title-long",
        category: "seo",
        severity: "warning",
        title: "Page title may be truncated in search results",
        detail: `Title is ${len} characters (recommended max ~60).`,
        fix: "Trim the title to 50–60 characters so it is not cut off in Google results.",
      });
    }
  }

  // --- Meta description ---
  if (!description) {
    add({
      id: "description-missing",
      category: "seo",
      severity: "warning",
      title: "Missing meta description",
      detail: "Google will auto-generate a snippet, which is usually less compelling.",
      fix: "Add a 50–160 character meta description with a clear value proposition and call to action.",
    });
  } else if (description.length < 50 || description.length > 160) {
    add({
      id: "description-length",
      category: "seo",
      severity: "info",
      title: "Meta description length is outside the ideal range",
      detail: `Description is ${description.length} characters (ideal 50–160).`,
      fix: "Rewrite the meta description to 50–160 characters.",
    });
  }

  // --- Headings ---
  if (h1Count === 0) {
    add({
      id: "h1-missing",
      category: "seo",
      severity: "warning",
      title: "No H1 heading found",
      detail: "Every page should have exactly one H1 describing its main topic.",
      fix: "Add a single <h1> that states the page's primary subject.",
    });
  } else if (h1Count > 1) {
    add({
      id: "h1-multiple",
      category: "seo",
      severity: "info",
      title: `Multiple H1 headings (${h1Count})`,
      detail: "Multiple H1s dilute the page's topical signal.",
      fix: "Keep one H1 and demote the rest to H2/H3.",
    });
  }

  // --- Mobile ---
  if (!hasViewport) {
    add({
      id: "viewport-missing",
      category: "mobile",
      severity: "critical",
      title: "Missing mobile viewport meta tag",
      detail: "Without a viewport tag the page renders zoomed-out and tiny on phones.",
      fix: 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">`.',
    });
  }

  // --- Social / canonical / structured data ---
  if (!hasOpenGraph) {
    add({
      id: "og-missing",
      category: "content",
      severity: "info",
      title: "No Open Graph tags",
      detail: "Shared links will show a plain URL instead of a rich preview card.",
      fix: "Add og:title, og:description and og:image.",
    });
  }
  if (!hasCanonical) {
    add({
      id: "canonical-missing",
      category: "seo",
      severity: "info",
      title: "No canonical link",
      detail: "Duplicate URLs may compete against each other in search results.",
      fix: '<link rel="canonical" href="https://your-domain.com/page">',
    });
  }
  if (!hasStructuredData) {
    add({
      id: "structured-data-missing",
      category: "seo",
      severity: "warning",
      title: "No structured data (JSON-LD)",
      detail: "Schema markup helps search engines understand the page and can unlock rich results.",
      fix: "Add JSON-LD (Organization, WebSite, Product, FAQ, etc.) relevant to the page.",
    });
  }

  // --- Images ---
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = images.filter((tag) => {
    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag);
    return !alt || !alt[1].trim();
  }).length;
  if (images.length > 0 && missingAlt > 0) {
    const pct = Math.round((missingAlt / images.length) * 100);
    add({
      id: "images-alt",
      category: "accessibility",
      severity: pct > 40 ? "warning" : "info",
      title: `${missingAlt} of ${images.length} images are missing alt text`,
      detail: "Alt text is required for screen-reader users and helps image SEO.",
      fix: "Add descriptive alt attributes to every meaningful image (decorative ones: alt=\"\").",
    });
  }

  // --- HTTPS / mixed content ---
  if (!isHttps) {
    add({
      id: "https",
      category: "security",
      severity: "critical",
      title: "Page is not served over HTTPS",
      detail: "Browsers flag HTTP pages as 'Not secure' and Google ranks HTTPS higher.",
      fix: "Install a TLS certificate and redirect all HTTP traffic to HTTPS.",
    });
  } else if (/(?:src|href)\s*=\s*["']http:\/\//i.test(html)) {
    add({
      id: "mixed-content",
      category: "security",
      severity: "critical",
      title: "Mixed content detected",
      detail: "The HTTPS page loads some resources over insecure HTTP, which browsers may block.",
      fix: "Serve every asset over HTTPS.",
    });
  }

  // --- Page weight ---
  if (htmlBytes > 150_000) {
    add({
      id: "html-size",
      category: "performance",
      severity: "warning",
      title: "Large HTML payload",
      detail: `The HTML document alone is ${Math.round(htmlBytes / 1024)} KB.`,
      fix: "Reduce inline scripts/styles and server-render less markup where possible.",
    });
  }

  // --- Security headers ---
  issues.push(...checkSecurityHeaders(headers));

  if (statusCode >= 400) {
    add({
      id: "status",
      category: "content",
      severity: "critical",
      title: `Page returned HTTP ${statusCode}`,
      detail: "Search engines and users cannot see content on an error response.",
      fix: "Fix the server response so the page returns 200.",
    });
  }

  const meta: MetaInfo = {
    title,
    description,
    h1Count,
    imagesTotal: images.length,
    imagesMissingAlt: missingAlt,
    htmlBytes,
    hasStructuredData,
    hasOpenGraph,
    hasCanonical,
    hasViewport,
    lang,
    https: isHttps,
    server: headers.get("server"),
    statusCode,
  };

  return { issues, meta };
}
