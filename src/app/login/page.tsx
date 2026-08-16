import type { Metadata } from "next";
import OwnerLoginPage from "@/components/OwnerLoginPage";

// Returns 200 to anonymous visitors, so `robots.ts` alone cannot keep it out of
// an index — a disallowed page can still be indexed from an external link,
// because the crawler never fetches it and so never sees this directive. Both
// are needed.
export const metadata: Metadata = {
  title: "Owner log in",
  description: "Sign in to your Dumala POS owner workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default OwnerLoginPage;
