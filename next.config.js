/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: __dirname,
  ...(process.env.CAPACITOR_EXPORT === '1' ? {
    output: 'export',
    images: { unoptimized: true },
  } : {}),
};
module.exports = nextConfig;
