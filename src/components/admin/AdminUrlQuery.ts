"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AdminUrlQueryValues = Record<string, string>;

function readUrlValues(keys: string[]): AdminUrlQueryValues {
  if (typeof window === "undefined") return {};
  const params = new URL(window.location.href).searchParams;
  return Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""]));
}

function writeUrlValues(values: AdminUrlQueryValues, keys: string[], mode: "push" | "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of keys) {
    const value = values[key] ?? "";
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history[`${mode}State`](window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Keeps small admin filter/search controls in the browser while retaining
 * shareable URLs. It deliberately uses History API updates so changing a
 * filter does not trigger an RSC request or block the current page.
 */
export function useAdminUrlQuery(initialValues: AdminUrlQueryValues, keys = Object.keys(initialValues)) {
  const keySignature = keys.slice().sort().join("\u0000");
  const stableKeys = useMemo(() => keySignature ? keySignature.split("\u0000") : [], [keySignature]);
  const valuesRef = useRef<AdminUrlQueryValues>({ ...initialValues });
  const [values, setValues] = useState<AdminUrlQueryValues>(() => ({ ...initialValues }));

  useEffect(() => {
    const syncFromUrl = () => {
      const next = { ...valuesRef.current };
      const urlValues = readUrlValues(stableKeys);
      for (const key of stableKeys) next[key] = urlValues[key] ?? "";
      valuesRef.current = next;
      setValues(next);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [stableKeys]);

  const update = useCallback((nextValues: Partial<AdminUrlQueryValues>, mode: "push" | "replace" = "replace") => {
    const next: AdminUrlQueryValues = { ...valuesRef.current };
    for (const [key, value] of Object.entries(nextValues)) next[key] = value ?? "";
    valuesRef.current = next;
    setValues(next);
    writeUrlValues(next, stableKeys, mode);
  }, [stableKeys]);

  return [values, update] as const;
}
