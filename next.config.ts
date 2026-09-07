import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['preview-chat-58d3b45f-29dd-4c25-a658-3be7cdb513b8.space-z.ai', '*.space-z.ai', '*.space-z.ai'],
  // endpoint proxy esterno che forwarda al server interno :3000
  experimental: {
    proxyTimeout: 180000, // 3 min, così la route AI (60-90s) non scade
  },
};

export default nextConfig;
