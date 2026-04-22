import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "voyageai"],
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack(config) {
    // Map .js imports to .ts/.tsx sources so TypeScript ESM packages
    // (which use .js extensions per NodeNext/Bundler convention) resolve
    // correctly under webpack — e.g. packages/shared and lib/judge0.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
