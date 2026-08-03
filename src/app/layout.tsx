import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lechon POS",
  description: "Fast, offline-first point of sale for lechon houses.",
};

export const viewport: Viewport = {
  themeColor: "#5b2a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
