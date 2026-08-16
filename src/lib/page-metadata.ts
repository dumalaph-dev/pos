import type { Metadata } from "next";

/**
 * The one social share card, at one stable URL.
 *
 * Referenced explicitly rather than through the `opengraph-image` file
 * convention. The convention attaches to the segment that holds the file, and
 * — more dangerously — a page that defines its own `openGraph` object drops the
 * inherited image along with every other inherited key. That is how /pricing
 * shipped advertising `twitter:card: summary_large_image` with no image behind
 * it, which renders worse than declaring no card at all.
 */
export const SHARE_IMAGE = {
  url: "/share-card.png",
  width: 1200,
  height: 630,
  alt: 'The Dumala POS owner dashboard on a counter terminal beside a card reader, with the headline "POS for cafes, restaurants and food businesses."',
} as const;

/**
 * Builds the `openGraph` and `twitter` blocks for a public page.
 *
 * Next resolves these objects by *replacement*, not by merging field by field:
 * a page that sets `openGraph.title` and nothing else silently loses `type`,
 * `siteName`, `locale` and `images` from the layout. The failure is invisible
 * in review and only shows in the rendered `<head>`, so every page goes through
 * this helper instead of hand-writing the blocks.
 *
 * `title` is the full string including the brand, because Open Graph has no
 * equivalent of the metadata title template.
 */
export function socialMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Root-relative, e.g. "/pricing". Resolved against `metadataBase`. */
  path: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Dumala POS",
      locale: "en_PH",
      title,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}
