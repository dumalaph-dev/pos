"use client";

import { useEffect, useState } from "react";

const STORE_NAMES = [
  "morning-ritual",
  "kusina-norte",
  "bean-and-batch",
  "crumb-and-kettle",
  "the-green-table",
  "harbor-house",
];

/** The animated part of the public-menu preview stays client-side and small. */
export default function LandingOnlineMenuDomain() {
  const [storeName, setStoreName] = useState(STORE_NAMES[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let index = 0;
    const intervalId = window.setInterval(() => {
      index = (index + 1) % STORE_NAMES.length;
      setStoreName(STORE_NAMES[index]);
    }, 2400);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div aria-hidden="true" className="rounded-[22px] border border-[#d9d2c1] bg-[#fffdf8] p-4 shadow-[0_16px_34px_rgba(23,58,43,0.10)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#173a2b]">Public menu link</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7efe4] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#42704d]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4e7f57]" /> Live
        </span>
      </div>

      <div className="mt-4 flex min-h-[64px] flex-wrap items-center gap-x-1 gap-y-1 rounded-2xl border-2 border-[#c39756] bg-[#fbf8f1] px-4 py-3 shadow-[inset_0_0_0_4px_rgba(195,151,86,0.08)] sm:min-h-[72px] sm:px-5">
        <span key={storeName} className="lp-domain-name break-words text-lg font-black tracking-[-0.04em] text-[#173a2b] sm:text-[1.45rem]">
          {storeName}
        </span>
        <span className="text-lg font-bold tracking-[-0.04em] text-[#b18448] sm:text-[1.45rem]">.dumala.store</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-semibold text-[#7b867b]">
        <span>Share it anywhere customers find you.</span>
        <span className="shrink-0 rounded-full border border-[#ded7c8] px-2 py-1 font-black uppercase tracking-[0.1em] text-[#8a795a]">QR-ready</span>
      </div>
    </div>
  );
}
