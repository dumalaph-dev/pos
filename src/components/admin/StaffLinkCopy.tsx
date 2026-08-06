"use client";

import { useState } from "react";

export default function StaffLinkCopy({ path, disabled = false }: { path: string; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyLink() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-btn border border-line bg-raised p-3 sm:flex-row sm:items-center sm:justify-between">
      <code className="min-w-0 break-all text-xs font-semibold text-ink-muted">{path}</code>
      <button type="button" onClick={() => void copyLink()} disabled={disabled} className="shrink-0 rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">
        {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy link"}
      </button>
    </div>
  );
}
