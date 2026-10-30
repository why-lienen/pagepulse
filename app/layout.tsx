import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PagePulse — Free website audit: performance, SEO, accessibility",
  description:
    "Paste any URL and get a real Lighthouse audit in seconds — performance, SEO, accessibility and security findings, prioritised fixes, and a client-ready proposal you can copy.",
  keywords: [
    "website audit",
    "lighthouse",
    "core web vitals",
    "seo checker",
    "performance test",
    "open source",
  ],
  openGraph: {
    title: "PagePulse — Free website audit",
    description:
      "Real Lighthouse scores, 40+ on-page checks and an AI-prioritised fix list. No signup, no API key.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
