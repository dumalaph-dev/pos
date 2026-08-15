import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dumala POS",
    short_name: "Dumala POS",
    description: "A simple POS workspace for growing businesses.",
    id: "/",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#f8f3eb",
    theme_color: "#173a2b",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // A separate asset, not the `any` icon above: Android crops the launcher
      // icon to its adaptive mask and only guarantees the centred 80% circle.
      // See scripts/generate-pwa-icons.mjs for the safe-zone derivation.
      {
        src: "/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
