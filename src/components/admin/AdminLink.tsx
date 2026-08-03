import NextLink from "next/link";
import type { ComponentProps } from "react";

type AdminLinkProps = ComponentProps<typeof NextLink>;

/**
 * Keep the App Router's automatic prefetch strategy for backoffice links.
 *
 * In Next 16, `null` enables partial prefetching for dynamic routes: the
 * loading boundary is warmed without fetching the full data-heavy page. This
 * keeps navigation responsive while avoiding the burst of full Supabase
 * requests that `prefetch={true}` would create for the sidebar.
 */
export function AdminLink({ prefetch = null, ...props }: AdminLinkProps) {
  return <NextLink {...props} prefetch={prefetch} />;
}
