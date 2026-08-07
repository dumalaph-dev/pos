"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ADMIN_THEME_OPTIONS, type AdminThemeId } from "@/lib/admin/branding";
import { AdminIcon } from "./AdminIcon";

const PREVIEW_THEME_CLASS_PREFIX = "admin-settings-preview__window--";

function applyThemePreview(theme: AdminThemeId) {
  document.querySelectorAll<HTMLElement>("[data-admin-theme]").forEach((node) => {
    node.dataset.adminTheme = theme;
  });

  document.querySelectorAll<HTMLElement>("[data-admin-theme-preview]").forEach((node) => {
    ADMIN_THEME_OPTIONS.forEach((option) => node.classList.remove(`${PREVIEW_THEME_CLASS_PREFIX}${option.id}`));
    node.classList.add(`${PREVIEW_THEME_CLASS_PREFIX}${theme}`);
  });
}

export function AdminThemePicker({ initialTheme, disabled }: { initialTheme: AdminThemeId; disabled: boolean }) {
  const [selectedTheme, setSelectedTheme] = useState<AdminThemeId>(initialTheme);
  const persistedThemeRef = useRef(initialTheme);
  const selectedOption = ADMIN_THEME_OPTIONS.find((option) => option.id === selectedTheme) ?? ADMIN_THEME_OPTIONS[0];
  const hasUnsavedTheme = selectedTheme !== initialTheme;

  useEffect(() => {
    persistedThemeRef.current = initialTheme;
  }, [initialTheme]);

  useEffect(() => {
    const previewTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-admin-theme-preview]"));
    const originalPreviewClasses = previewTargets.map((node) => node.className);

    return () => {
      document.querySelectorAll<HTMLElement>("[data-admin-theme]").forEach((node) => {
        node.dataset.adminTheme = persistedThemeRef.current;
      });
      previewTargets.forEach((node, index) => {
        node.className = originalPreviewClasses[index] ?? node.className;
      });
    };
  }, []);

  useEffect(() => {
    applyThemePreview(selectedTheme);
  }, [selectedTheme]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="admin-panel__eyebrow">Workspace theme</p>
          <h3 className="mt-1 text-base font-extrabold text-ink">Choose a comfortable dashboard style</h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Preview a style instantly. Saving applies it across the admin dashboard, inventory, products, and settings pages. POS appearance stays managed in POS settings.</p>
        </div>
        <span className="admin-settings-theme-pill" aria-live="polite">{selectedOption.label} theme</span>
      </div>

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <legend className="sr-only">Dashboard theme</legend>
        {ADMIN_THEME_OPTIONS.map((option) => (
          <label key={option.id} className="admin-theme-option">
            <input
              type="radio"
              name="admin_theme"
              value={option.id}
              checked={selectedTheme === option.id}
              disabled={disabled}
              onChange={() => setSelectedTheme(option.id)}
            />
            <span className="admin-theme-option__card">
              <span className={`admin-theme-option__swatch admin-theme-option__swatch--${option.id}`} aria-hidden="true"><i /><i /><i /></span>
              <span className="admin-theme-option__copy"><strong>{option.label}</strong><small>{option.description}</small></span>
              <span className="admin-theme-option__check" aria-hidden="true"><AdminIcon name="check" size={13} /></span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-ink-muted" aria-live="polite">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasUnsavedTheme ? "bg-accent" : "bg-success"}`} aria-hidden="true" />
        {hasUnsavedTheme ? `${selectedOption.label} is previewing now. Save to keep it for your team.` : "Select any style to preview it here before saving."}
      </p>
    </div>
  );
}

export function AdminSettingsSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving settings…" : "Save dashboard settings"}
    </button>
  );
}
