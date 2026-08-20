"use client";

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
    <div className="pos-style-options" role="radiogroup" aria-label={ariaLabel}>
      {POS_THEME_OPTIONS.map((theme) => {
        const selected = value === theme.id;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            key={theme.id}
            onClick={() => onChange(theme.id)}
            className={`pos-style-option ${selected ? "is-selected" : ""}`}
            aria-label={`Use ${theme.label} theme`}
            title={theme.description}
          >
            <span className={`pos-style-thumbnail pos-style-thumbnail--${theme.id}`} aria-hidden="true">
              <i className="pos-style-thumbnail__top" />
              <i className="pos-style-thumbnail__rail" />
              <i className="pos-style-thumbnail__card" />
              <i className="pos-style-thumbnail__order" />
              <i className="pos-style-thumbnail__accent" />
            </span>
            <span>
              <strong>{theme.label}</strong>
              <small>{theme.mood}</small>
            </span>
            <span className="pos-style-radio" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
