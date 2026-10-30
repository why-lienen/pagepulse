import { Suspense } from "react";
import ReportClient from "@/components/ReportClient";

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <div className="progress-wrap">
            <div className="progress-head">
              <h2>Loading…</h2>
              <p>Preparing the audit</p>
            </div>
            <div className="progress-bar">
              <i style={{ width: "12%" }} />
            </div>
          </div>
        </main>
      }
    >
      <ReportClient />
    </Suspense>
  );
}
