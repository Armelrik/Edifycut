import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/zoom/*": ["./scripts/zoom-recorder.mjs", "./node_modules/@zoom/rtms/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.tools/**/*", "./.env*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
