import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // output: "export",  // ⛔ désactivé pour utiliser /api
  images: { unoptimized: true },
};

export default nextConfig;
