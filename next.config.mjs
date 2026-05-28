/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // exceljs / prisma are heavy CJS deps; keep them on the server bundle only.
  // (In Next 14 this lives under `experimental`; it graduated to top-level in 15.)
  experimental: {
    serverComponentsExternalPackages: ["exceljs", "@prisma/client", "prisma"],
  },
};

export default nextConfig;
