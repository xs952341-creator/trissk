import "./globals.css";
import { Toaster } from "sonner";
import Script from "next/script";
import GA4 from "@/components/GA4";
import PWARegister from "@/components/PWARegister";
import CommandPalette from "@/components/ui/CommandPalette";
import { getPublicAppUrl, NEXT_PUBLIC_GA4_ID } from "@/lib/runtime-config";
import { BRAND } from "@/lib/brand";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Playbook Hub — Marketplace de SaaS e Ferramentas de IA",
    template: "%s — Playbook Hub",
  },
  description:
    "O marketplace completo para criadores e compradores de ferramentas de IA no Brasil. Checkout nativo com PIX, afiliados multi-level, analytics avançado e SaaS provisioning.",
  keywords: ["marketplace", "SaaS", "IA", "automação", "afiliados", "playbook", "checkout", "PIX"],
  authors: [{ name: "Playbook Hub" }],
  creator: "Playbook Hub",
  metadataBase: new URL(getPublicAppUrl()),
  openGraph: {
    type: "website",
    siteName: "Playbook Hub",
    title: "Playbook Hub — Marketplace de SaaS e Ferramentas de IA",
    description: "O marketplace completo para criadores e compradores de ferramentas de IA no Brasil.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Playbook Hub — Marketplace de SaaS e Ferramentas de IA",
    description: "O marketplace completo para criadores e compradores de ferramentas de IA no Brasil.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: "#080b0e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ga4Id = NEXT_PUBLIC_GA4_ID;

  return (
    <html lang="pt-BR" className="dark">
      <head>
        {/* Preconnect para performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preload das fontes críticas */}
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap"
          as="style"
        />
      </head>
      <body
        className="antialiased min-h-screen flex flex-col"
        style={{ background: "var(--surface-0)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
      >
        {/* Google Analytics */}
        {ga4Id && (
          <>
            <Script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} />
            <Script id="ga4">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}',{send_page_view:false});`}
            </Script>
            <GA4 />
          </>
        )}
        <CommandPalette />
        <PWARegister />
        {children}

        {/* Toaster — estilo premium */}
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
            style: {
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontFamily: "var(--font-body)",
              borderRadius: "12px",
              boxShadow: "var(--shadow-elevated)",
            },
          }}
        />
      </body>
    </html>
  );
}
