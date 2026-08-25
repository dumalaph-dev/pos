import type { ShiftReading } from "@/lib/shifts";

/**
 * The serializable report snapshot shown from the dashboard. The reading is
 * copied from the append-only Z-reading archive, so the dashboard never
 * recalculates a closed shift from mutable order rows.
 */
export type DashboardShiftReport = {
  id: string;
  shiftId: string;
  zNumber: number;
  businessDate: string;
  generatedAt: string;
  grandTotalAfter: number;
  note: string | null;
  cashierName: string;
  branchName: string;
  reading: ShiftReading;
};
