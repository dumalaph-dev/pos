"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import { POS_THEME_OPTIONS, type PosThemeId } from "@/lib/pos-theme";

export function PosThemePicker({
  value,
  onChange,
  ariaLabel = "Interface theme",
}: {
  value: PosThemeId;
  onChange: (value: PosThemeId) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label={ariaLabel}>
      {POS_THEME_OPTIONS.map((theme) => {
        const selected = value === theme.id;
        const variables = theme.variables;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            key={theme.id}
            onClick={() => onChange(theme.id)}
            className={`group min-w-0 rounded-2xl border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary-soft shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_18%,transparent)]" : "border-line bg-surface hover:border-line-strong hover:bg-raised"}`}
          >
            <span
              className="relative block aspect-[1.55] overflow-hidden rounded-xl border shadow-sm"
              style={{
                borderColor: variables["--pos-theme-border"],
                background: variables["--pos-theme-bg"],
              }}
              aria-hidden="true"
            >
              <i className="absolute inset-x-0 top-0 h-4" style={{ background: variables["--pos-theme-topbar"] }} />
              <i className="absolute bottom-0 left-0 top-4 w-1/5" style={{ background: variables["--pos-theme-sidebar"] }} />
              <i className="absolute bottom-2 left-[24%] right-2 top-6 rounded-[5px] border" style={{ borderColor: variables["--pos-theme-border"], background: variables["--pos-theme-surface-raised"] }} />
              <i className="absolute bottom-4 left-[31%] h-1.5 w-1/4 rounded-full" style={{ background: variables["--pos-theme-highlight"] }} />
              <i className="absolute bottom-2 right-2 h-1.5 w-1/5 rounded-full" style={{ background: variables["--pos-theme-highlight"] }} />
            </span>
            <span className="mt-2 flex min-w-0 items-start justify-between gap-1.5">
              <span className="min-w-0">
                <strong className="block truncate text-[11px] font-extrabold text-ink">{theme.label}</strong>
                <small className="mt-0.5 block truncate text-[10px] font-semibold text-ink-muted">{theme.mood}</small>
              </span>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-fg" : "border-line-strong text-transparent"}`} aria-hidden="true">
                <AdminIcon name="check" size={11} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
