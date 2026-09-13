import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // This site is independent of the Electron project in the parent folder.
  outputFileTracingRoot: path.resolve(process.cwd()),
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
