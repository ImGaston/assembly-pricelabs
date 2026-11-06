/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Internal admin: never indexed; framable only by Assembly (the Custom App's
  // Internal-facing URL) — override the allowlist with ADMIN_FRAME_ANCESTORS.
  async headers() {
    const ancestors = process.env.ADMIN_FRAME_ANCESTORS
      || "'self' https://*.assembly.com https://*.myassembly.com https://*.copilot.app https://*.copilot.com";
    return [{
      source: '/admin/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Content-Security-Policy', value: `frame-ancestors ${ancestors}` },
      ],
    }];
  },
};

module.exports = nextConfig;
