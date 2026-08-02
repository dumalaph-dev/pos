import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DAY_MS = 24 * 60 * 60 * 1000;

function singaporeStart() {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
  return new Date(`${date}T00:00:00+08:00`);
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "cashier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range");
  const end = singaporeStart();
  const days = requestedRange === "today" ? 1 : requestedRange === "30d" ? 30 : requestedRange === "90d" ? 90 : 7;
  const start = new Date(end.getTime() - DAY_MS * (days - 1));
  let ordersQuery = supabase
    .from("orders")
    .select("order_no, status, payment_method, subtotal, discount_amount, vat_amount, total, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (requestedRange !== "all") {
    ordersQuery = ordersQuery.gte("created_at", start.toISOString()).lt("created_at", new Date(end.getTime() + DAY_MS).toISOString());
  }
  const branchFilter = url.searchParams.get("branch");
  if (branchFilter) ordersQuery = ordersQuery.eq("store_id", branchFilter);
  const { data, error } = await ordersQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{
    order_no: string;
    status: string;
    payment_method: string;
    subtotal: number;
    discount_amount: number;
    vat_amount: number;
    total: number;
    created_at: string;
  }>;
  const header = ["Order number", "Created at", "Status", "Payment method", "Subtotal centavos", "Discount centavos", "VAT centavos", "Total centavos"];
  const body = rows.map((order) => [
    order.order_no,
    order.created_at,
    order.status,
    order.payment_method,
    order.subtotal,
    order.discount_amount,
    order.vat_amount,
    order.total,
  ]);
  const csv = [header, ...body].map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\r\n");
  const dateLabel = end.toISOString().slice(0, 10);

  return new NextResponse(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marios-lechon-report-${dateLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
