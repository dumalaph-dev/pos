import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import OfflineBanner from "@/components/OfflineBanner";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import SWRegister from "@/components/SWRegister";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const DESCRIPTION = "A simple POS workspace for owners, branches, teams, and busy counters.";

export const metadata: Metadata = {
  // Every URL-based metadata field below resolves against this, so canonical
  // tags and og:image URLs come out absolute. Without it, a relative image path
  // is a build error and social crawlers get nothing.
  metadataBase: new URL(siteUrl()),
  // Pages set a bare title and inherit the suffix; the landing page opts out
  // with `title: { absolute: ... }` because its own title already ends in the
  // brand and would otherwise read "… | Dumala POS | Dumala POS".
  title: {
    default: "Dumala POS",
    template: "%s | Dumala POS",
  },
  description: DESCRIPTION,
  applicationName: "Dumala POS",
  openGraph: {
    type: "website",
    siteName: "Dumala POS",
    locale: "en_PH",
    title: "Dumala POS — POS for cafes, restaurants & food businesses",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dumala POS — POS for cafes, restaurants & food businesses",
    description: DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dumala POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#173a2b",
  width: "device-width",
  initialScale: 1,
};

// Nonce-based CSP requires request-time rendering so Next can attach the
// request nonce to its framework scripts and inline styles.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <OfflineBanner />
        {children}
        <PWAInstallPrompt />
        <SWRegister />
      </body>
    </html>
  );
}
