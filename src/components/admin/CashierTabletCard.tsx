"use client";

import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import type { StaffLoginLink } from "@/lib/admin/staff-links";
import { PWAInstallButton } from "@/components/PWAInstallPrompt";
import { AdminIcon } from "./AdminIcon";

/**
 * The three things a counter tablet needs, in the order they have to happen.
 * Installing before signing in matters: the installed app keeps its own
 * storage, so a cashier who signs in first and installs second has to sign in
 * again inside the app and usually reads that as the link being broken.
 */
const TABLET_STEPS = [
  {
    title: "Open the branch link on the tablet",
    body: "Type the link into the tablet's browser, or scan the QR code below with the tablet camera. The link opens the branch sign-in screen — it identifies the store, it does not sign anyone in.",
  },
  {
    title: "Install Dumala on the tablet",
    body: "Use the browser's install action so the POS opens full screen from the home screen and keeps working through a short internet drop.",
  },
  {
    title: "Sign in with the cashier's own Employee ID",
    body: "Each cashier signs in with their own Employee ID and password, so every sale, discount and shift is recorded against the right person.",
  },
] as const;

function absoluteLink(path: string) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function CashierTabletCard({
  links,
  legacyOnly = false,
  compact = false,
}: {
  links: StaffLoginLink[];
  legacyOnly?: boolean;
  compact?: boolean;
}) {
  const activeLinks = useMemo(() => links.filter((link) => link.isActive), [links]);
  const [selectedId, setSelectedId] = useState(() => activeLinks[0]?.id ?? links[0]?.id ?? "");
  const [origin, setOrigin] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  const selected = links.find((link) => link.id === selectedId) ?? activeLinks[0] ?? links[0] ?? null;
  // Rendered only after mount so the server and client markup agree; before
  // that the relative path is shown, which is still a usable instruction.
  const shareUrl = selected ? (origin ? `${origin}${selected.path}` : selected.path) : "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the deployed origin is only knowable in the browser, and the tablet has to type this exact host.
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!selected || !origin) return;
    let cancelled = false;
    QRCode.toDataURL(absoluteLink(selected.path), {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#173a2b", light: "#fffdf8" },
    }).then((dataUrl) => {
      if (!cancelled) setQrCode(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrCode(null);
    });
    return () => { cancelled = true; };
  }, [origin, selected]);

  async function copyLink() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(absoluteLink(selected.path));
      setCopied("copied");
      window.setTimeout(() => setCopied("idle"), 1800);
    } catch {
      setCopied("error");
    }
  }

  function downloadQrCode() {
    if (!qrCode || !selected) return;
    const link = document.createElement("a");
    link.href = qrCode;
    link.download = `${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branch"}-cashier-link.png`;
    link.click();
  }

  if (links.length === 0) {
    return (
      <section className="cashier-tablet cashier-tablet--empty" aria-labelledby="cashier-tablet-heading">
        <span className="cashier-tablet__mark"><AdminIcon name="pos" size={18} /></span>
        <div>
          <p className="cashier-tablet__eyebrow">Cashier tablet</p>
          <h3 id="cashier-tablet-heading">Create a branch to get the cashier link</h3>
          <p>Each active branch gets its own sign-in link for counter tablets. Add your first branch and the link appears here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`cashier-tablet ${compact ? "cashier-tablet--compact" : ""}`} aria-labelledby="cashier-tablet-heading">
      <div className="cashier-tablet__head">
        <span className="cashier-tablet__mark"><AdminIcon name="pos" size={18} /></span>
        <div>
          <p className="cashier-tablet__eyebrow">Cashier tablet</p>
          <h3 id="cashier-tablet-heading">The link your cashiers open on the tablet</h3>
          <p>Send this to the counter device once. It opens the branch sign-in screen, where each cashier signs in with their own Employee ID.</p>
        </div>
      </div>

      {links.length > 1 && (
        <div className="cashier-tablet__branches" role="group" aria-label="Choose a branch">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              className={`cashier-tablet__branch ${selected?.id === link.id ? "is-active" : ""}`}
              aria-pressed={selected?.id === link.id}
              onClick={() => { setSelectedId(link.id); setQrCode(null); }}
            >
              {link.name}
              {!link.isActive && <small>Inactive</small>}
            </button>
          ))}
        </div>
      )}

      <div className="cashier-tablet__link-row">
        <div className="cashier-tablet__link">
          <span className="cashier-tablet__link-label">{selected?.name ?? "Branch"} sign-in link</span>
          <code>{shareUrl}</code>
        </div>
        <div className="cashier-tablet__link-actions">
          <button type="button" onClick={() => void copyLink()} className="cashier-tablet__button cashier-tablet__button--primary">
            <AdminIcon name={copied === "copied" ? "check" : "columns"} size={14} />
            {copied === "copied" ? "Copied" : copied === "error" ? "Copy failed" : "Copy link"}
          </button>
          {selected && <a href={selected.path} target="_blank" rel="noreferrer" className="cashier-tablet__button">Open <AdminIcon name="arrow" size={13} /></a>}
        </div>
      </div>

      {selected && !selected.isActive && (
        <p role="status" className="cashier-tablet__warning"><AdminIcon name="alert" size={14} /> {selected.name} is inactive, so this link will not let anyone sign in until the branch is reactivated.</p>
      )}

      {legacyOnly && (
        <p role="status" className="cashier-tablet__warning"><AdminIcon name="alert" size={14} /> Readable branch links are not available in this workspace yet, so the long ID link is shown. Apply migration 0033 to get the shorter /staff/ link.</p>
      )}

      <div className="cashier-tablet__body">
        <ol className="cashier-tablet__steps">
          {TABLET_STEPS.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                {index === 1 && <PWAInstallButton className="cashier-tablet__button cashier-tablet__button--install">Install on this device</PWAInstallButton>}
              </div>
            </li>
          ))}
        </ol>

        <div className="cashier-tablet__qr">
          {qrCode
            // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL has no remote source for the image optimizer to fetch.
            ? <img src={qrCode} alt={`QR code linking to the ${selected?.name ?? "branch"} cashier sign-in page`} width={148} height={148} />
            : <div className="cashier-tablet__qr-placeholder" aria-hidden="true" />}
          <p>Scan with the tablet camera</p>
          <button type="button" onClick={downloadQrCode} disabled={!qrCode} className="cashier-tablet__button">
            <AdminIcon name="download" size={13} /> Save QR
          </button>
        </div>
      </div>

      <p className="cashier-tablet__note">
        <AdminIcon name="lock" size={13} />
        The link only names the branch — it grants no access on its own. A cashier still needs an Employee ID and password, so a shared or printed link is safe to leave at the counter.
      </p>
    </section>
  );
}

export default CashierTabletCard;
