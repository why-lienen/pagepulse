/**
 * The OpenAPI document, kept in one place so the JSON route and the human
 * viewer render exactly the same contract.
 */

export type OASchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  const?: string;
  enum?: unknown[];
  items?: OASchema;
  properties?: Record<string, OASchema>;
  required?: string[];
  additionalProperties?: OASchema | boolean;
  $ref?: string;
  examples?: string[];
};

export type OAResponse = {
  description?: string;
  $ref?: string;
  content?: Record<string, { schema?: OASchema }>;
};

export type OAParameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OASchema;
};

export type OAOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OAParameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: OASchema }>;
  };
  responses?: Record<string, OAResponse>;
};

export type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
    license?: { name: string };
  };
  servers?: { url: string; description?: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, OAOperation>>;
  components?: {
    schemas?: Record<string, OASchema>;
    responses?: Record<string, OAResponse>;
  };
};

export const OPENAPI_SPEC: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "PagePulse API",
    version: "1.0.0",
    summary:
      "Real Lighthouse scores, 40+ on-page checks and a prioritised fix list for any public URL.",
    description:
      "POST a URL to start an audit. Long-running servers answer 202 with a job id to poll; serverless hosts run the audit inline and answer 200 with the finished report. No authentication, no API key.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/", description: "This deployment" }],
  tags: [
    { name: "audit", description: "Start an audit and read its result" },
    { name: "meta", description: "Service metadata" },
  ],
  paths: {
    "/api/audit": {
      post: {
        tags: ["audit"],
        summary: "Start an audit",
        operationId: "startAudit",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: {
                    type: "string",
                    description: "Any public http(s) URL. A missing scheme is upgraded to https.",
                    examples: ["example.com", "https://stripe.com/pricing"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Serverless host: the audit already ran and the full report is in the response.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DoneResponse" },
              },
            },
          },
          202: {
            description: "Queued. Poll GET /api/audit?id=… until status is done.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueuedResponse" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          429: { $ref: "#/components/responses/RateLimited" },
          502: { $ref: "#/components/responses/TargetUnreachable" },
          503: { $ref: "#/components/responses/QueueFull" },
        },
      },
      get: {
        tags: ["audit"],
        summary: "Poll a job",
        operationId: "getAudit",
        parameters: [
          {
            name: "id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Job id returned by POST /api/audit.",
          },
        ],
        responses: {
          200: {
            description: "Current job state. `report` is present once status is `done`.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobResponse" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["meta"],
        summary: "Liveness and queue depth",
        operationId: "health",
        responses: {
          200: {
            description: "Service is up.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    version: { type: "string" },
                    queue: { $ref: "#/components/schemas/Queue" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Queue: {
        type: "object",
        properties: {
          running: { type: "integer", description: "Audits executing right now." },
          queued: { type: "integer", description: "Jobs waiting." },
          concurrency: { type: "integer", description: "Configured parallel audits." },
          maxQueue: { type: "integer", description: "Configured queue ceiling." },
        },
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string", description: "Job id, poll it with GET /api/audit?id=…" },
          url: { type: "string", description: "Normalised URL that was audited." },
          status: { type: "string", enum: ["queued", "running", "done", "error"] },
          stage: {
            type: "string",
            enum: ["queued", "fetch", "rules", "lighthouse", "ai", "done"],
          },
          position: { type: ["integer", "null"], description: "1-based queue position." },
          queueLength: { type: "integer", description: "Jobs waiting behind this one." },
          running: { type: "integer", description: "Audits executing right now." },
          elapsedMs: { type: "integer", description: "Time since the job was created." },
          etaSeconds: { type: ["integer", "null"], description: "Rough wait estimate." },
          report: { $ref: "#/components/schemas/Report" },
          error: { type: "string", description: "Safe to show to end users when status is error." },
        },
      },
      QueuedResponse: {
        type: "object",
        properties: {
          status: { type: "string", const: "queued", description: "Always queued on this response." },
          job: { $ref: "#/components/schemas/Job" },
          queue: { $ref: "#/components/schemas/Queue" },
        },
      },
      JobResponse: {
        type: "object",
        properties: {
          status: { type: "string", description: "Mirrors job.status for convenience." },
          job: { $ref: "#/components/schemas/Job" },
          queue: { $ref: "#/components/schemas/Queue" },
        },
      },
      DoneResponse: {
        type: "object",
        properties: {
          status: { type: "string", const: "done", description: "Always done on this response." },
          report: { $ref: "#/components/schemas/Report" },
          queue: { $ref: "#/components/schemas/Queue" },
        },
      },
      CategoryScore: {
        type: "object",
        properties: {
          key: {
            type: "string",
            enum: ["performance", "accessibility", "seo", "best-practices"],
            description: "Stable identifier.",
          },
          label: { type: "string", description: "Human-readable name." },
          score: { type: ["integer", "null"], description: "0-100, or null when unmeasured." },
        },
      },
      Issue: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable slug, e.g. missing-meta-description." },
          category: {
            type: "string",
            enum: [
              "seo",
              "performance",
              "accessibility",
              "best-practices",
              "security",
              "content",
              "mobile",
            ],
          },
          severity: { type: "string", enum: ["critical", "warning", "info", "pass"] },
          title: { type: "string", description: "One-line summary of the finding." },
          detail: { type: "string", description: "Why it matters." },
          fix: { type: "string", description: "What to change." },
        },
      },
      Report: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL that was requested." },
          finalUrl: { type: "string", description: "URL after redirects." },
          fetchedAt: { type: "string", format: "date-time" },
          overall: { type: "integer", description: "0-100 overall score." },
          grade: { type: "string", description: "A+ · A · B · C · D" },
          scoreBasis: { type: "string", enum: ["lighthouse", "rules"] },
          lighthouseError: {
            type: ["string", "null"],
            description: "Why Lighthouse produced no numbers, when it failed.",
          },
          perfSource: {
            type: ["string", "null"],
            enum: ["local-lighthouse", "pagespeed", null],
            description: "Which engine produced the scores.",
          },
          perfNote: {
            type: ["string", "null"],
            description: "How performance was measured, in plain language.",
          },
          categories: {
            type: "array",
            items: { $ref: "#/components/schemas/CategoryScore" },
            description: "The four Lighthouse categories, in display order.",
          },
          issues: {
            type: "array",
            items: { $ref: "#/components/schemas/Issue" },
            description: "Every finding, including the ones that passed.",
          },
          meta: {
            type: "object",
            properties: {
              title: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              h1Count: { type: "integer" },
              imagesTotal: { type: "integer" },
              imagesMissingAlt: { type: "integer" },
              htmlBytes: { type: "integer" },
              hasStructuredData: { type: "boolean" },
              hasOpenGraph: { type: "boolean" },
              hasCanonical: { type: "boolean" },
              hasViewport: { type: "boolean" },
              lang: { type: ["string", "null"] },
              https: { type: "boolean" },
              server: { type: ["string", "null"] },
              statusCode: { type: "integer" },
            },
          },
          metrics: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "lcp, cls, tbt, fcp, speedIndex as display strings.",
          },
          proposal: { type: "string", description: "Rule-based, AI-free proposal paragraph." },
          ai: {
            type: ["object", "null"],
            properties: {
              headline: { type: "string" },
              topIssues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    why: { type: "string" },
                    fix: { type: "string" },
                  },
                },
              },
              quickWins: { type: "array", items: { type: "string" } },
              proposalBlurb: { type: "string" },
            },
          },
          aiEnabled: {
            type: "boolean",
            description: "True when the deployment has an AI key configured.",
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "Plain-language reason, safe to show to end users.",
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid URL, missing field, or a blocked private host.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Unknown or expired job id.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      RateLimited: {
        description: "Per-IP audit limit reached.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      TargetUnreachable: {
        description: "The audited page could not be fetched.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      QueueFull: {
        description: "Queue at capacity, retry shortly.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
};
