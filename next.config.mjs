/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "sharp"],
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
