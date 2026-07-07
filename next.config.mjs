/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Export CSV de LinkedIn Ads Manager (Admin → carga manual): un año de
    // Ad Performance Report en UTF-16 puede rondar varios MB.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
