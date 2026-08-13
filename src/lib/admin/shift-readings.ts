import type { ShiftReading } from "@/lib/shifts";

export type ShiftZReadingRecord = {
  id: string;
  shift_id: string;
  store_id: string;
  z_number: number;
  business_date: string;
  net_sales: number;
  declared_cash: number;
  cash_variance: number;
  grand_total_after: number;
  note: string | null;
  generated_at: string;
};

/** Serializable, non-authorizing data used by the local shift reading view. */
export type ShiftDialogReadModel = {
  reading: ShiftReading;
  zReading: ShiftZReadingRecord | null;
  cashierName: string;
  branchName: string;
};
