import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lechon POS",
    short_name: "Lechon POS",
    description: "Point-of-sale for the store — works offline.",
    id: "/",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#f5ecdf",
    theme_color: "#9a2e13",
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
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
