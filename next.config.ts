import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security/headers.ts";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return securityHeaderRules({
      dev: process.env.NODE_ENV !== "production",
      vercelEnv: process.env.VERCEL_ENV,
    });
  },
};

export default nextConfig;
