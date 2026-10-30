import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import SiteNav from "@/components/SiteNav";
import { ArrowIcon, ExternalIcon } from "@/components/Icons";
import {
  OPENAPI_SPEC,
  type OAOperation,
  type OAResponse,
  type OASchema,
} from "@/lib/openapi";
import { REPO_URL } from "@/lib/site";

export const metadata = {
  title: "OpenAPI 3.1 — PagePulse",
  description:
    "The PagePulse API contract, rendered. Every endpoint, field, enum and error code in one readable page, with the raw openapi.json one click away.",
};

const SPEC = OPENAPI_SPEC;

const ENDPOINTS: { path: string; method: string; op: OAOperation }[] = Object.entries(
  SPEC.paths
).flatMap(([path, ops]) =>
  Object.entries(ops).map(([method, op]) => ({ path, method, op }))
);

const SCHEMAS = Object.entries(SPEC.components?.schemas ?? {});

const slug = (method: string, path: string) =>
  `op-${method}-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;

const refName = (ref?: string) => (ref ? ref.split("/").pop() ?? "" : "");

function typeLabel(s: OASchema): string {
  if (s.$ref) return refName(s.$ref);
  if (s.const !== undefined) return `"${s.const}"`;
  if (s.type === "array") return `array<${s.items ? typeLabel(s.items) : "any"}>`;
  if (Array.isArray(s.type)) return s.type.join(" | ");
  if (s.additionalProperties && typeof s.additionalProperties === "object") {
    return `map<string, ${typeLabel(s.additionalProperties)}>`;
  }
  if (s.type) return s.type;
  if (s.properties) return "object";
  if (s.additionalProperties) return "map<string>";
  return "any";
}

function notes(s: OASchema): string {
  const parts: string[] = [];
  if (s.description) parts.push(s.description);
  if (s.enum?.length) {
    const values = s.enum.filter((v) => v !== null).map((v) => String(v));
    parts.push(`one of ${values.join(", ")}`);
  }
  if (s.format) parts.push(s.format);
  return parts.join(" · ");
}

/** Flattens nested object schemas into indented table rows, two levels deep. */
function propRows(schema: OASchema, depth = 0, trail = ""): ReactNode[] {
  if (!schema.properties) return [];
  const required = new Set(schema.required ?? []);
  const rows: ReactNode[] = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    const key = `${trail}${depth}:${name}`;
    rows.push(
      <tr key={key}>
        <td style={{ paddingLeft: 12 + depth * 22 }}>
          {depth > 0 && <span className="tree">└</span>}
          <code className="inline-code">{name}</code>
          {required.has(name) && <span className="req">required</span>}
        </td>
        <td>
          <span className="type-chip">{typeLabel(prop)}</span>
        </td>
        <td>{notes(prop)}</td>
      </tr>
    );

    const nested = prop.type === "array" ? prop.items : prop;
    if (depth < 2 && nested && !nested.$ref && nested.properties) {
      rows.push(...propRows(nested, depth + 1, `${trail}${name}.`));
    }
  }

  return rows;
}

function statusTone(code: string) {
  if (code.startsWith("2")) return "2xx";
  if (code.startsWith("4")) return "4xx";
  return "5xx";
}

function resolveResponse(raw: OAResponse): OAResponse {
  if (raw.$ref) return SPEC.components?.responses?.[refName(raw.$ref)] ?? raw;
  return raw;
}

export default function OpenApiPage() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.includes("localhost") || host.startsWith("127.");
  const origin = `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
  const lines = JSON.stringify(SPEC, null, 2).split("\n");
  const preview = `${lines.slice(0, 16).join("\n")}\n  …  ${lines.length - 16} more lines`;

  return (
    <>
      <SiteNav />

      <main className="container docs-main">
        <header className="docs-hero">
          <p className="section-kicker">OpenAPI · {SPEC.openapi}</p>
          <h1>
            The whole contract,
            <br />
            <span className="grad">in one readable page</span>
          </h1>
          <p className="docs-lede">
            This is the same document that <code className="inline-code">/openapi.json</code>{" "}
            serves — rendered instead of dumped. Every endpoint, field, enum and error code the
            API can produce, generated straight from the spec so the two can never drift apart.
          </p>

          <div className="chip-row">
            <span className="chip">{SPEC.info.title}</span>
            <span className="chip">v{SPEC.info.version}</span>
            <span className="chip">{ENDPOINTS.length} operations</span>
            <span className="chip">{SCHEMAS.length} schemas</span>
            <a className="chip chip-link" href="#raw">
              Raw JSON <ArrowIcon size={12} />
            </a>
          </div>
        </header>

        <div className="docs-layout">
          <aside className="docs-toc">
            <p>On this file</p>
            <a href="#overview">Overview</a>
            <a href="#servers">Servers</a>
            {ENDPOINTS.map((e) => (
              <a key={slug(e.method, e.path)} href={`#${slug(e.method, e.path)}`}>
                {e.method.toUpperCase()} {e.path}
              </a>
            ))}
            <p style={{ marginTop: 18 }}>Schemas</p>
            {SCHEMAS.map(([name]) => (
              <a key={name} href={`#schema-${name}`}>
                {name}
              </a>
            ))}
            <a href="#raw" style={{ marginTop: 14 }}>
              Raw file
            </a>
          </aside>

          <div className="docs-body">
            <section className="docs-section" id="overview">
              <h2>Overview</h2>
              <p className="docs-p">{SPEC.info.summary}</p>
              <p className="docs-p">{SPEC.info.description}</p>
              <table className="docs-table tbl-meta">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code className="inline-code">openapi</code>
                    </td>
                    <td className="dim">{SPEC.openapi}</td>
                  </tr>
                  <tr>
                    <td>
                      <code className="inline-code">info.version</code>
                    </td>
                    <td className="dim">{SPEC.info.version}</td>
                  </tr>
                  <tr>
                    <td>
                      <code className="inline-code">info.license</code>
                    </td>
                    <td className="dim">{SPEC.info.license?.name}</td>
                  </tr>
                  <tr>
                    <td>
                      <code className="inline-code">security</code>
                    </td>
                    <td className="dim">
                      none — no authentication scheme is declared, so no key is required
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code className="inline-code">tags</code>
                    </td>
                    <td className="dim">
                      {(SPEC.tags ?? []).map((t) => `${t.name} — ${t.description}`).join(" · ")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="docs-section" id="servers">
              <h2>Servers</h2>
              <p className="docs-p">
                Every path in this document is relative, so the spec works unchanged on any
                deployment. On this host the base URL is:
              </p>
              <div className="spec-card">
                <div className="spec-meta">
                  <code className="inline-code">{origin}</code>
                  <span className="dim">
                    Import <code className="inline-code">{origin}/openapi.json</code> into
                    Postman, Insomnia or Bruno to get every request pre-filled.
                  </span>
                </div>
              </div>
            </section>

            {ENDPOINTS.map(({ path, method, op }) => {
              const id = slug(method, path);
              const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
              return (
                <section className="docs-section" id={id} key={id}>
                  <h2>
                    <span className={`method method-${method}`}>{method.toUpperCase()}</span>
                    <span className="endpoint-path">{path}</span>
                  </h2>
                  <p className="docs-p">
                    <b>{op.summary}.</b> {op.description}
                  </p>

                  {op.parameters?.length ? (
                    <>
                      <p className="spec-sub">Parameters</p>
                      <table className="docs-table tbl-params">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>In</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {op.parameters.map((p) => (
                            <tr key={p.name}>
                              <td>
                                <code className="inline-code">{p.name}</code>
                                {p.required && <span className="req">required</span>}
                              </td>
                              <td>
                                <span className="type-chip">{p.schema ? typeLabel(p.schema) : "string"}</span>
                              </td>
                              <td className="dim">{p.in}</td>
                              <td>{p.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}

                  {bodySchema ? (
                    <>
                      <p className="spec-sub">
                        Request body · application/json{op.requestBody?.required ? " · required" : ""}
                      </p>
                      {op.requestBody?.description && (
                        <p className="docs-p">{op.requestBody.description}</p>
                      )}
                      <table className="docs-table tbl-props">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Type</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>{propRows(bodySchema, 0, `${id}-body`)}</tbody>
                      </table>
                    </>
                  ) : null}

                  <p className="spec-sub">Responses</p>
                  <table className="docs-table tbl-resp">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Body</th>
                        <th>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(op.responses ?? {}).map(([code, raw]) => {
                        const res = resolveResponse(raw);
                        const schema = res.content?.["application/json"]?.schema;
                        return (
                          <tr key={code}>
                            <td>
                              <span className={`status status-${statusTone(code)}`}>{code}</span>
                            </td>
                            <td>
                              <span className="type-chip">{schema ? typeLabel(schema) : "empty"}</span>
                            </td>
                            <td>{res.description}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}

            <section className="docs-section" id="schemas">
              <h2>Schemas</h2>
              <p className="docs-p">
                Every object in the response, with exact field names and types. Fields marked{" "}
                <span className="req">required</span> are always present; everything else can be
                missing or <code className="inline-code">null</code>.
              </p>

              {SCHEMAS.map(([name, schema]) => (
                <div className="schema-card" id={`schema-${name}`} key={name}>
                  <div className="schema-head">
                    <code>{name}</code>
                    <span className="type-chip">
                      {typeLabel(schema)}
                      {schema.properties
                        ? ` · ${Object.keys(schema.properties).length} fields`
                        : ""}
                    </span>
                  </div>
                  {schema.description && <p className="docs-p">{schema.description}</p>}
                  <table className="docs-table tbl-props">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Type</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>{propRows(schema, 0, name)}</tbody>
                  </table>
                </div>
              ))}
            </section>

            <section className="docs-section" id="raw">
              <h2>Raw file</h2>
              <p className="docs-p">
                The same document as JSON, served with{" "}
                <code className="inline-code">cache-control: public, max-age=3600</code> and an
                open CORS policy so a browser app can load it directly.
              </p>

              <div className="code-card">
                <div className="code-head">
                  <span className="code-title">GET /openapi.json</span>
                  <div className="code-head-right">
                    <a className="code-copy" href="/openapi.json" download>
                      Download
                    </a>
                    <a
                      className="code-copy"
                      href="/openapi.json"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open raw <ExternalIcon size={12} />
                    </a>
                  </div>
                </div>
                <pre className="code-body code-wrap">{preview}</pre>
              </div>

              <p className="docs-p" style={{ marginTop: 12, fontSize: 13 }}>
                Above is the head of the file. The full document is{" "}
                {JSON.stringify(SPEC, null, 2).split("\n").length} lines — use{" "}
                <b>Download</b> to keep a copy, or point Postman at the URL directly.
              </p>

              <div className="docs-cta">
                <div>
                  <h3>Need the prose version?</h3>
                  <p>
                    The endpoint guide walks through a real request end to end, with cURL,
                    JavaScript and Python examples, the report object explained and every error
                    code.
                  </p>
                </div>
                <div className="docs-cta-actions">
                  <Link className="btn btn-ghost btn-sm" href="/api-docs">
                    Read the guide
                  </Link>
                  <a
                    className="btn btn-sm"
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source <ExternalIcon size={13} />
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <span>PagePulse — MIT licensed. Built with Next.js and Google Lighthouse.</span>
          <div className="foot-links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/api-docs">JSON API</Link>
            <a href="/openapi.json" target="_blank" rel="noreferrer">
              openapi.json
            </a>
            <Link href="/">Home</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
