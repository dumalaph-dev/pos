"use client";

import { useEffect, useState } from "react";
import type { DisplayConnectionStatus, DisplayLink } from "@/lib/display";
import type { PrintState } from "@/lib/pos/state-machines";
import type { SyncState } from "@/lib/pos/state-machines";

export type TerminalStatus = "ready" | "offline" | "attention" | "syncing";

export function usePosHardwareStatus({
  displayLink,
  offline,
  printState,
  syncState,
}: {
  displayLink: DisplayLink | null;
  offline: boolean;
  printState: PrintState;
  syncState: SyncState;
}) {
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [displayStatus, setDisplayStatus] = useState<DisplayConnectionStatus>("disconnected");

  useEffect(() => {
    const update = () => setNetworkOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!displayLink) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- display status is an external transport subscription.
      setDisplayStatus("disconnected");
      return;
    }
    return displayLink.onStatus(setDisplayStatus);
  }, [displayLink]);

  const terminalStatus: TerminalStatus = offline || !networkOnline
    ? "offline"
    : printState.status === "failed" || syncState.status === "failed"
      ? "attention"
      : syncState.status === "syncing"
        ? "syncing"
        : "ready";

  return { networkOnline, displayStatus, terminalStatus };
}
