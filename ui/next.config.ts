import type { NextConfig } from "next";

const API_TARGET = process.env.API_PROXY_TARGET || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
      { source: "/health", destination: `${API_TARGET}/health` },
      { source: "/phases", destination: `${API_TARGET}/phases` },
      { source: "/scan/:path*", destination: `${API_TARGET}/scan/:path*` },
      { source: "/sessions/:path*", destination: `${API_TARGET}/sessions/:path*` },
      { source: "/targets/:path*", destination: `${API_TARGET}/targets/:path*` },
      { source: "/ws/:path*", destination: `${API_TARGET}/ws/:path*` },
    ];
  },
};

export default nextConfig;
