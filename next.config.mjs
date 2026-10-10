/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;
