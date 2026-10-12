/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Internal admin: never indexed, never framed (client dashboards stay embeddable).
  async headers() {
    return [{
      source: '/admin/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

module.exports = nextConfig;
