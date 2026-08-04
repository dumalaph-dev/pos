"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function AdminNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  return <NavigationProgressBar key={routeKey} />;
}

function NavigationProgressBar() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.hasAttribute("download") || target.target === "_blank") return;

      const nextUrl = new URL(target.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.origin !== currentUrl.origin || (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search)) return;

      setPending(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => setPending(false), 10000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  return (
    <div className={`admin-navigation-progress ${pending ? "is-pending" : ""}`} aria-hidden="true">
      <span />
    </div>
  );
}
