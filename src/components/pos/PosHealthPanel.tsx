"use client";

import type { DisplayConnectionStatus } from "@/lib/display";
import type { SyncState } from "@/lib/pos/state-machines";
import type { TerminalStatus } from "@/components/pos/usePosHardwareStatus";

function timeLabel(value: string | null): string {
  if (!value) return "None queued";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function labelForDisplay(status: DisplayConnectionStatus): string {
  return status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Disconnected";
}

function labelForTerminal(status: TerminalStatus): string {
  return status === "ready" ? "Ready" : status === "syncing" ? "Syncing" : status === "offline" ? "Offline" : "Needs attention";
}

export default function PosHealthPanel({
  pending,
  oldestQueuedSaleAt,
  failedPrintCount,
  displayStatus,
  terminalStatus,
  syncState,
  onSync,
}: {
  pending: number;
  oldestQueuedSaleAt: string | null;
  failedPrintCount: number;
  displayStatus: DisplayConnectionStatus;
  terminalStatus: TerminalStatus;
  syncState: SyncState;
  onSync: () => void;
}) {
  const hasAttention = terminalStatus === "attention" || pending > 0 || syncState.status === "failed" || failedPrintCount > 0;
  return (
    <details className="pos-health-panel">
      <summary className={`pos-health-panel__summary${hasAttention ? " is-attention" : ""}`} aria-label="Open operational health panel">
        <span className={`pos-health-panel__dot is-${terminalStatus}`} aria-hidden="true" />
        <span>System health</span>
        <strong>{labelForTerminal(terminalStatus)}</strong>
      </summary>
      <div className="pos-health-panel__body">
        <div className="pos-health-panel__heading">
          <div>
            <p>Terminal operations</p>
            <strong>Live health</strong>
          </div>
          {pending > 0 && <button type="button" onClick={onSync} className="pos-health-panel__sync">Sync now</button>}
        </div>
        <dl className="pos-health-panel__metrics">
          <div><dt>Pending sync</dt><dd className="tnums">{pending}</dd></div>
          <div><dt>Oldest queued sale</dt><dd>{timeLabel(oldestQueuedSaleAt)}</dd></div>
          <div><dt>Failed prints</dt><dd className="tnums">{failedPrintCount}</dd></div>
          <div><dt>Customer display</dt><dd>{labelForDisplay(displayStatus)}</dd></div>
          <div><dt>Sync state</dt><dd>{syncState.status === "failed" ? "Retrying" : syncState.status === "offline" ? "Waiting for connection" : labelForTerminal(terminalStatus)}</dd></div>
        </dl>
        {syncState.error && <p className="pos-health-panel__error" role="status">{syncState.error}</p>}
      </div>
    </details>
  );
}
