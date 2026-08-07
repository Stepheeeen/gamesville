import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN hosts allowed to load dev resources (HMR, /_next/*) — needed to
  // play-test on a phone over the local network. Dev-only; ignored in prod.
  allowedDevOrigins: ["172.20.10.3"],
};

export default nextConfig;
