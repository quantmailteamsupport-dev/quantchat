import type { NextConfig } from "next";

const workspaceRoot = process.cwd().replace(/\/apps\/admin$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
