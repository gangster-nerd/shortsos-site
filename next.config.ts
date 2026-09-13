import type { NextConfig } from "next";

// Static-first: `output: "export"` produces a plain static `out/` directory with no Node
// server runtime. This site is a pure consumer of a pinned manifest artifact — there is no
// server-side data fetching, no API routes, no product DB, no provider SDKs. If a future
// mission needs an actual server (e.g. a form POST handler), that is a deliberate,
// documented departure from this default, not an incidental one.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
