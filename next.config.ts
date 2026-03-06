import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required for the slim Docker image (node server.js)
  output: "standalone",
};

export default nextConfig;
