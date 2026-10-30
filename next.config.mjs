/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets `NEXT_DIST_DIR=.next-build npm run build` run next to a live dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // The audit route spawns `scripts/lighthouse-runner.mjs` as a child process,
    // so Next's static file tracing has to be told about it — otherwise the
    // production/serverless bundle ships without the runner or without Chrome.
    outputFileTracingIncludes: {
      "/api/audit": [
        "./scripts/lighthouse-runner.mjs",
        "./node_modules/@sparticuz/chromium/**",
        "./node_modules/chrome-launcher/**",
        "./node_modules/lighthouse/**",
      ],
    },
  },
};

export default nextConfig;
