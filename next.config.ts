import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native and worker files are required at runtime and are easy for the file tracer to miss.
  serverExternalPackages: ['argon2', 'pdfjs-dist', 'pg', 'mammoth', '@sentry/nextjs', '@sentry/node'],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/argon2/prebuilds/**/*',
      './node_modules/pdfjs-dist/legacy/build/**/*',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
    ],
    '/**/*': ['./node_modules/argon2/prebuilds/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default nextConfig;
