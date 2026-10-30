import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/openapi";

// The document itself lives in lib/openapi.ts so the viewer at /openapi renders
// exactly the same contract this endpoint serves.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
      // Point readers at the readable version, and let tooling find it.
      link: '</openapi>; rel="alternate"; type="text/html"',
    },
  });
}
