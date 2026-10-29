import { NextResponse, type NextRequest } from "next/server";
import { getApiUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { applyTxFilters, parseTxFilters } from "@/lib/data/transactions";

export async function GET(req: NextRequest) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const f = parseTxFilters(Object.fromEntries(req.nextUrl.searchParams));
  let q = u.supabase.from("transactions").select("*, categories(name), businesses(name)").eq("user_id", u.user.id).order("occurred_on", { ascending: false });
  q = applyTxFilters(q, f);
  const { data, error } = await q.limit(50_000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const csv = toCsv(
    ["Date", "Type", "Amount", "Currency", "Description", "Category", "Scope", "Payment method", "Counterparty", "Source", "Notes", "Demo"],
    (data ?? []).map((t) => [
      t.occurred_on, t.type, Number(t.amount).toFixed(2), t.currency, t.description, t.categories?.name ?? "",
      t.businesses?.name ?? "Personal", t.payment_method, t.counterparty, t.source, t.notes, t.is_demo ? "yes" : "",
    ]),
  );
  await u.supabase.rpc("log_audit", { p_action: "transactions_exported", p_metadata: { rows: data?.length ?? 0 } });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lifepilot-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
