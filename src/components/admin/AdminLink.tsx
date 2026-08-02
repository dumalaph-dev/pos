import NextLink from "next/link";
import type { ComponentProps } from "react";

type AdminLinkProps = ComponentProps<typeof NextLink>;

/**
 * Admin pages are data-heavy server routes. Keep the navigation responsive by
 * opting out of automatic prefetching, which would otherwise start several
 * Supabase-backed requests simply because the sidebar is visible.
 */
export function AdminLink({ prefetch = false, ...props }: AdminLinkProps) {
  return <NextLink {...props} prefetch={prefetch} />;
}
