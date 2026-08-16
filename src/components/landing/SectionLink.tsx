import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A link to a section of the landing page, from either the landing page itself
 * or a standalone content page.
 *
 * The two cases need different elements, and getting this wrong fails quietly:
 *
 * - On the landing page, `<Link href="/#features">` is a *same-route*
 *   navigation. Next updates the hash but the browser never performs its native
 *   fragment scroll, so the header nav silently stops moving the page. A plain
 *   anchor with a bare `#features` scrolls the way it always has.
 * - On any other page, a bare `#features` resolves against the wrong document
 *   and does nothing at all, so the link has to carry the path — and because
 *   that is a real route change, `Link` handles the hash correctly.
 *
 * `eslint-plugin-next` also enforces exactly this split: `<a href="/#...">`
 * trips `no-html-link-for-pages`, while a bare fragment is fine.
 */
export default function SectionLink({
  section,
  onLandingPage,
  className,
  onClick,
  children,
}: {
  /** The target id, without the leading "#". */
  section: string;
  onLandingPage: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (onLandingPage) {
    return (
      <a href={`#${section}`} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={`/#${section}`} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
