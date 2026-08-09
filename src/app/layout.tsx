import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import OfflineBanner from "@/components/OfflineBanner";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dumala POS",
  description: "A simple POS workspace for owners, branches, teams, and busy counters.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <OfflineBanner />
        {children}
        <PWAInstallPrompt />
        <SWRegister />
      </body>
    </html>
  );
}
