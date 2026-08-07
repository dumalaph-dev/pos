"use client";

import { useEffect } from "react";

/**
 * Reveals every `[data-lp-reveal]` element on the landing page as it scrolls
 * into view. Kept as a single observer so the page itself stays a server
 * component and the markup stays free of wrapper elements.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-lp-reveal]"));
    if (nodes.length === 0) return;

    const revealAll = () => nodes.forEach((node) => node.classList.add("is-revealed"));

    if (typeof IntersectionObserver === "undefined") {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return null;
}
