"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowIcon, GithubIcon } from "./Icons";
import { REPO_URL } from "@/lib/site";

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${scrolled ? " scrolled" : ""}`}>
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>
          PagePulse
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <Link href="/#features">What it checks</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/api-docs">API</Link>
        </nav>

        <div className="nav-cta">
          <a
            className="nav-icon"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="PagePulse on GitHub"
            title="Source on GitHub"
          >
            <GithubIcon size={18} />
          </a>
          <Link href="/#audit" className="btn btn-sm">
            Run an audit
            <ArrowIcon size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
