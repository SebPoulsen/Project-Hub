/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Data lives outside the app dir (iCloud). Nothing to configure for that here —
  // all disk access happens inside Node route handlers (see src/app/api/*).
};

export default nextConfig;
