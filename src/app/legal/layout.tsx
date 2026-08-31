import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal",
  description: "Dumala POS legal, privacy, billing, ordering, and support documents.",
};

export const dynamic = "force-dynamic";

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
