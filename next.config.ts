import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{ source: '/api/:path*', headers: [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ] }];
  },
};
export default config;
