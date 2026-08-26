"use client";

import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { refreshAdminInventoryViews } from "@/app/admin/inventory/actions";
import { toCentavos } from "@/lib/money";
import {
  createAdminCacheScopeKey,
  enqueueAdminMutation,
  flushAdminMutationOutbox,
  type AdminCacheScope,
  type AdminInventoryCountPayload,
  type AdminInventoryMovementPayload,
  type AdminMutationKind,
  type AdminMutationPayload,
} from "@/lib/admin/local-first-store";

type MutationFormState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "queued"; message: string }
  | { phase: "error"; message: string };

const MOVEMENT_TYPES = new Set(["receive", "yield_in", "yield_out", "waste", "adjust"]);

function textValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readMovementPayload(data: FormData): AdminInventoryMovementPayload {
  const type = textValue(data, "type");
  const qty = Number(textValue(data, "qty"));
  const unitCostValue = textValue(data, "unit_cost");
  const unitCostPeso = unitCostValue ? Number(unitCostValue) : null;
  if (!MOVEMENT_TYPES.has(type) || !Number.isFinite(qty)) {
    throw new Error("Choose a movement type and enter a valid quantity.");
  }
  if (unitCostPeso !== null && !Number.isFinite(unitCostPeso)) {
    throw new Error("Unit cost must be a valid amount.");
  }
  return {
    storeId: textValue(data, "store_id"),
    productId: textValue(data, "product_id"),
    type: type as AdminInventoryMovementPayload["type"],
    qty,
    unitCostCentavos: unitCostPeso === null ? null : toCentavos(unitCostPeso),
    reason: textValue(data, "reason") || null,
  };
}

function readCountPayload(data: FormData): AdminInventoryCountPayload {
  const counts: AdminInventoryCountPayload["counts"] = [];
  for (const [name, value] of data.entries()) {
    if (!name.startsWith("counted_") || typeof value !== "string") continue;
    const productId = name.slice("counted_".length);
    const countedQty = Number(value.trim());
    counts.push({ product_id: productId, counted_qty: countedQty });
  }
  return {
    storeId: textValue(data, "store_id"),
    countDate: textValue(data, "count_date"),
    counts,
  };
}

function readPayload(kind: AdminMutationKind, data: FormData): AdminMutationPayload {
  return kind === "inventory_movement" ? readMovementPayload(data) : readCountPayload(data);
}

export function AdminMutationForm({
  children,
  scope,
  kind,
  className,
}: {
  children: ReactNode;
  scope: AdminCacheScope;
  kind: AdminMutationKind;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<MutationFormState>({ phase: "idle" });
  const syncClientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const submitLockRef = useRef(false);
  const queuedSignatureRef = useRef<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || state.phase === "saving") return;

    submitLockRef.current = true;
    setState({ phase: "saving" });
    try {
      const payload = readPayload(kind, new FormData(event.currentTarget));
      if (payload.storeId !== scope.storeId) {
        throw new Error("The selected branch changed. Refresh the page before saving this change.");
      }
      const payloadSignature = JSON.stringify(payload);
      if (queuedSignatureRef.current === payloadSignature) {
        setState({
          phase: "queued",
          message: "This exact change was already submitted from this form. Edit a value before saving it again.",
        });
        return;
      }
      await enqueueAdminMutation(scope, kind, payload);
      const online = navigator.onLine;
      let pending = 1;
      if (online) {
        syncClientRef.current ??= createClient();
        const result = await flushAdminMutationOutbox(syncClientRef.current, scope);
        pending = result.pending;
        if (result.synced > 0) {
          try {
            await refreshAdminInventoryViews();
          } catch {
            // The mutation is already committed; the next report visit still
            // reads the ledger directly if route invalidation is unavailable.
          }
          router.refresh();
        }
        if (result.failed > 0 || result.conflicts > 0) {
          throw new Error(result.lastError ?? "The stock movement is waiting to sync.");
        }
      }
      queuedSignatureRef.current = payloadSignature;
      window.dispatchEvent(new CustomEvent("dumala:admin-mutation-queued", {
        detail: { scopeKey: createAdminCacheScopeKey(scope) },
      }));
      setState({
        phase: "queued",
        message: online
          ? pending === 0
            ? "Saved and synced. Inventory reports are up to date."
            : "Saved on this device. Syncing securely in the background."
          : "Saved on this device. It will sync automatically when the connection returns.",
      });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "The change could not be saved on this device.",
      });
    } finally {
      submitLockRef.current = false;
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onClickCapture={(event) => {
        if (!submitLockRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onChangeCapture={() => {
        if (submitLockRef.current) return;
        queuedSignatureRef.current = null;
        setState((current) => current.phase === "queued" ? { phase: "idle" } : current);
      }}
      data-admin-mutation-form={kind}
      aria-busy={state.phase === "saving"}
      className={className}
    >
      {children}
      {state.phase !== "idle" && (
        <p
          role={state.phase === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`md:col-span-2 xl:col-span-4 text-xs font-semibold ${state.phase === "error" ? "text-danger" : "text-success"}`}
        >
          {state.phase === "saving" ? "Saving on this device…" : state.message}
        </p>
      )}
    </form>
  );
}
