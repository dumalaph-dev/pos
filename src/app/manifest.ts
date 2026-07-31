import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lechon POS",
    short_name: "Lechon POS",
    description: "Point-of-sale for the store — works offline.",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f5ecdf",
    theme_color: "#9a2e13",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
