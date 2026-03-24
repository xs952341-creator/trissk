/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Image domains ──────────────────────────────────────────────────────────
  // Restringir domínios de imagem em vez de permitir tudo (**) — evita hotlinking malicioso
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: 'stripe.com' },
      { protocol: 'https', hostname: '**.stripe.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
    ],
    // Formats modernos para menor tamanho
    formats: ['image/avif', 'image/webp'],
  },

  // ── Security headers ───────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // Força HTTPS por 1 ano (HSTS) — só ativar depois do domínio estar em HTTPS definitivo
          // { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      // Webhook routes: sem cache, sem CSRF
      {
        source: '/api/webhooks/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      // API routes públicas: sem cache
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },

  // ── Redirects ──────────────────────────────────────────────────────────────
  async redirects() {
    return [
      { source: '/admin/dashboard', destination: '/admin', permanent: false },
    ];
  },

  // ── Experimental ───────────────────────────────────────────────────────────
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
  },

  // ── Webpack ───────────────────────────────────────────────────────────────
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
