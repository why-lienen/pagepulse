"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowIcon, GlobeIcon } from "./Icons";

const EXAMPLES = ["stripe.com", "vercel.com", "goldensinceregroup.com"];

export default function AuditForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function go(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setLoading(true);
    router.push(`/audit?url=${encodeURIComponent(clean)}`);
  }

  return (
    <>
      <form
        className="urlbox"
        id="audit"
        onSubmit={(e) => {
          e.preventDefault();
          go(url);
        }}
      >
        <span className="urlbox-icon">
          <GlobeIcon size={19} />
        </span>
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Website URL"
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Starting…" : "Audit site"}
          {!loading && <ArrowIcon size={16} />}
        </button>
      </form>

      <div className="chips">
        <span>Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="chip"
            onClick={() => {
              setUrl(example);
              go(example);
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </>
  );
}
