"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ImportProductsPanel } from "@/components/admin/ImportProductsPanel";

type ImportProductsPanelProps = ComponentProps<typeof ImportProductsPanel>;

const ImportPanel = dynamic(
  () => import("@/components/admin/ImportProductsPanel").then((module) => module.ImportProductsPanel),
  { loading: () => <section className="products-panel" role="status">Loading import tools…</section> },
);

export function LazyImportProductsPanel(props: ImportProductsPanelProps) {
  return <ImportPanel {...props} />;
}
