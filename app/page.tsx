import Link from "next/link";
import AuditForm from "@/components/AuditForm";
import SiteNav from "@/components/SiteNav";
import { REPO_URL } from "@/lib/site";
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  GaugeIcon,
  GithubIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
} from "@/components/Icons";

const CHECKS = [
  {
    icon: <GaugeIcon size={20} />,
    tone: "",
    title: "Real Lighthouse scores",
    body: "Performance, accessibility, SEO and best practices measured in a headless Chrome — plus Core Web Vitals (LCP, CLS, TBT, FCP).",
  },
  {
    icon: <SearchIcon size={20} />,
    tone: "blue",
    title: "40+ on-page checks",
    body: "Title length, meta description, heading structure, canonical, structured data, sitemap, robots.txt and image alt coverage.",
  },
  {
    icon: <ShieldIcon size={20} />,
    tone: "violet",
    title: "Security & delivery",
    body: "HTTPS, mixed content, HSTS, X-Content-Type-Options, frame protection, Referrer-Policy and payload size.",
  },
  {
    icon: <SparkIcon size={20} />,
    tone: "blue",
    title: "An AI summary that prioritises",
    body: "Turns every finding into a ranked action list: what matters most, why it costs you customers, and how to fix it.",
  },
  {
    icon: <CodeIcon size={20} />,
    tone: "",
    title: "A proposal you can send",
    body: "One click copies a client-ready paragraph built from your real findings — no more generic “I can build you a website”.",
  },
  {
    icon: <BoltIcon size={20} />,
    tone: "violet",
    title: "Nothing to install",
    body: "No signup, no browser extension, no Google account. Paste a URL and the report is generated live — never stored.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Paste a URL",
    body: "Any public http or https page. The site is fetched server-side, so login walls and CORS do not get in the way.",
  },
  {
    n: "02",
    title: "We run the whole stack",
    body: "HTML parsing, header inspection, sitemap and robots checks, then a full Lighthouse pass in headless Chrome.",
  },
  {
    n: "03",
    title: "Read, fix, ship",
    body: "You get scores per category, every issue with a concrete fix, and a summary of where to start.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />

      <main>
        <section className="container hero">
          <span className="eyebrow">
            <span className="dot" />
            Open source · Free · No signup
          </span>

          <h1>
            Audit any website in <span className="grad">seconds</span>
          </h1>

          <p className="lede">
            Real Lighthouse scores, forty-plus on-page checks and a prioritised fix list.
            Paste a URL — get a report your client would pay for.
          </p>

          <AuditForm />

          <div className="trust">
            <span>
              <CheckIcon size={13} /> Real headless Chrome, not an estimate
            </span>
            <span>
              <CheckIcon size={13} /> No account, no API key
            </span>
            <span>
              <CheckIcon size={13} /> Reports never stored
            </span>
          </div>

          <div className="hero-links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubIcon size={14} />
              Source on GitHub
            </a>
            <span className="dot-sep">·</span>
            <Link href="/api-docs">JSON API docs</Link>
            <span className="dot-sep">·</span>
            <Link href="/openapi">OpenAPI 3.1</Link>
          </div>
        </section>

        <section className="container section" id="features">
          <div className="section-head">
            <p className="section-kicker">What it checks</p>
            <h2>Everything that makes a site slow, invisible or untrustworthy</h2>
            <p>One pass covers the technical surface most audits charge for separately.</p>
          </div>

          <div className="grid-3">
            {CHECKS.map((item) => (
              <article className="card" key={item.title}>
                <div className={`card-icon ${item.tone}`}>{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container section" id="how">
          <div className="section-head">
            <p className="section-kicker">How it works</p>
            <h2>Three steps, about twenty seconds</h2>
            <p>No configuration. The heavy lifting happens on the server, not in your browser.</p>
          </div>

          <div className="steps">
            {STEPS.map((step) => (
              <div className="step" key={step.n}>
                <div className="step-num">{step.n}</div>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <span>PagePulse — MIT licensed. Built with Next.js and Google Lighthouse.</span>
          <div className="foot-links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/api-docs">JSON API</Link>
            <Link href="/openapi">OpenAPI</Link>
            <a href="#audit">Run an audit</a>
          </div>
        </div>
      </footer>
    </>
  );
}
