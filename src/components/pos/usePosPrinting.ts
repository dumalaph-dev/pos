"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import { getPrinter, type PrinterSettings } from "@/lib/printer";
import { printReducer, type PrintState } from "@/lib/pos/state-machines";

export function usePosPrinting(settings: PrinterSettings, onFailure?: (message: string, label: string) => void) {
  const [state, dispatch] = useReducer(printReducer, { status: "idle" } satisfies PrintState);
  const [failedCount, setFailedCount] = useState(0);
  const [hasReceipt, setHasReceipt] = useState(false);
  const lastReceipt = useRef<Uint8Array | null>(null);

  const doPrint = useCallback(async (bytes: Uint8Array, label = "receipt") => {
    lastReceipt.current = bytes;
    setHasReceipt(true);
    dispatch({ type: "start", label });
    try {
      const printer = await getPrinter(settings);
      await printer.print(bytes);
      dispatch({ type: "success", label });
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFailedCount((count) => count + 1);
      dispatch({ type: "failure", label, error: message });
      onFailure?.(message, label);
      return false;
    }
  }, [onFailure, settings]);

  return { doPrint, lastReceipt, hasReceipt, failedCount, state };
}
