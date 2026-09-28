import type { NextConfig } from 'next';

/** Where the Express API runs. The browser only ever talks to this app; /api/* is forwarded server-side. */
const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://localhost:4000').origin;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The shared package is consumed as TypeScript source.
  transpilePackages: ['@heribertova/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
