"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

export interface CodeTab {
  label: string;
  code: string;
}

export default function CodeTabs({ tabs, title }: { tabs: CodeTab[]; title?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const current = tabs[Math.min(active, tabs.length - 1)];

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard permission denied — the text is selectable anyway */
    }
  }

  return (
    <div className="code-card">
      <div className="code-head">
        <div className="code-tabs" role="tablist" aria-label="Code examples">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`code-tab${i === active ? " is-on" : ""}`}
              onClick={() => setActive(i)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="code-head-right">
          {title ? <span className="code-title">{title}</span> : null}
          <button type="button" className="code-copy" onClick={copy}>
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <pre className="code-body">
        <code>{current.code}</code>
      </pre>
    </div>
  );
}
