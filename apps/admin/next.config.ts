import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@restaurant-os/ui"]
};

export default nextConfig;
