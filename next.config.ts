import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Bill photos for "Scan a bill" are shrunk in the browser first (about 0.5 MB); this leaves room.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    // Conservative hardening headers applied to every route. A full
    // Content-Security-Policy is intentionally left out for now: it needs
    // care around the inline pre-paint theme script and Vercel Analytics,
    // and is best added in its own change.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
