/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Data lives outside the app dir (iCloud). Nothing to configure for that here —
  // all disk access happens inside Node route handlers (see src/app/api/*).
  //
  // The build output dir is overridable via PROJECTHUB_DISTDIR so a throwaway
  // dev/verification server can build into its own folder (e.g. .next-dev) and
  // never touch the production `.next` that `npm start` (port 4321) serves.
  distDir: process.env.PROJECTHUB_DISTDIR || ".next",
};

export default nextConfig;
