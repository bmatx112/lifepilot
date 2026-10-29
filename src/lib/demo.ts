import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToDateString, localInputToUtc, todayInTz } from "@/lib/dates";

/**
 * Inserts clearly-labelled sample records (is_demo = true) so the app can be
 * explored. Every demo row is shown with a "Demo" badge and can be removed in one click.
 */
async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(`Demo data: ${error.message}`);
}

export async function seedDemoData(supabase: SupabaseClient, userId: string, tz: string, currency: string) {
  const today = todayInTz(tz);
  const d = (n: number) => addDaysToDateString(today, n);
  const at = (n: number, hhmm: string) => localInputToUtc(`${d(n)}T${hhmm}`, tz).toISOString();
  const { data: cats } = await supabase.from("categories").select("id, name").eq("user_id", userId);
  const cat = (name: string) => cats?.find((c) => c.name === name)?.id ?? null;

  const { data: biz, error: bizErr } = await supabase.from("businesses").insert({
    user_id: userId, name: "Demo Consulting (sample)", description: "Sample business created by demo mode", industry: "Consulting", currency, color: "#7c3aed", is_demo: true,
  }).select("id").single();
  if (bizErr) throw new Error(bizErr.message);
  const b = biz.id as string;

  const { data: contact } = await supabase.from("contacts").insert({ user_id: userId, business_id: b, name: "Sample Client Ltd", email: "client@example.com", company: "Sample Client Ltd", role: "Customer" }).select("id").single();
  const { data: project } = await supabase.from("projects").insert({ user_id: userId, business_id: b, name: "Website redesign (sample)", status: "active", priority: "high", due_date: d(21), is_demo: true }).select("id").single();

  const tx = [
    { type: "income", amount: 1800, description: "Salary (sample)", category_id: cat("Salary"), occurred_on: `${today.slice(0, 8)}01` },
    { type: "expense", amount: 450, description: "Rent (sample)", category_id: cat("Housing"), occurred_on: `${today.slice(0, 8)}02` },
    { type: "expense", amount: 86.4, description: "Groceries (sample)", category_id: cat("Groceries"), occurred_on: d(-3) },
    { type: "expense", amount: 42, description: "Fuel (sample)", category_id: cat("Fuel"), occurred_on: d(-2) },
    { type: "expense", amount: 25, description: "Airtime & data (sample)", category_id: cat("Airtime & data"), occurred_on: d(-1) },
    { type: "expense", amount: 1250, currency: "ZWG", description: "ZESA electricity tokens (sample)", category_id: cat("Utilities"), occurred_on: d(-4) },
    { type: "income", amount: 1200, description: "Client retainer (sample)", category_id: cat("Business income"), occurred_on: d(-5), business_id: b },
    { type: "expense", amount: 60, description: "Software subscription (sample)", category_id: cat("Supplies"), occurred_on: d(-6), business_id: b },
    { type: "expense", amount: 300, description: "Rent (sample)", category_id: cat("Housing"), occurred_on: addDaysToDateString(`${today.slice(0, 8)}02`, -30) },
    { type: "income", amount: 1800, description: "Salary (sample)", category_id: cat("Salary"), occurred_on: addDaysToDateString(`${today.slice(0, 8)}01`, -30) },
    { type: "expense", amount: 210, description: "Groceries (sample)", category_id: cat("Groceries"), occurred_on: addDaysToDateString(today, -33) },
  ].map((t) => ({ user_id: userId, currency, payment_method: "Cash", is_demo: true, business_id: null, ...t }));
  await must(supabase.from("transactions").insert(tx, { defaultToNull: false }));

  await must(supabase.from("budgets").insert([
    { user_id: userId, name: "Groceries (sample)", amount: 110, currency, period: "monthly", category_id: cat("Groceries"), is_demo: true },
    { user_id: userId, name: "Monthly spending (sample)", amount: 900, currency, period: "monthly", is_demo: true },
  ], { defaultToNull: false }));
  await must(supabase.from("bills").insert([
    { user_id: userId, kind: "payable", title: "Internet subscription (sample)", amount: 50, currency, due_date: d(2), recurrence: "monthly", category_id: cat("Utilities"), is_demo: true },
    { user_id: userId, kind: "payable", title: "Medical aid (sample)", amount: 95, currency, due_date: d(-1), category_id: cat("Health"), is_demo: true },
    { user_id: userId, kind: "receivable", title: "Invoice INV-0042 (sample)", invoice_number: "INV-0042", amount: 750, currency, due_date: d(5), business_id: b, contact_id: contact?.id ?? null, is_demo: true },
  ], { defaultToNull: false }));
  await must(supabase.from("tasks").insert([
    { user_id: userId, title: "Prepare monthly budget review (sample)", priority: "medium", due_at: at(0, "16:00"), reminder_offsets: [60], is_demo: true },
    { user_id: userId, title: "Send proposal to client (sample)", priority: "urgent", due_at: at(-1, "12:00"), business_id: b, project_id: project?.id ?? null, is_demo: true },
    { user_id: userId, title: "Renew vehicle licence (sample)", priority: "high", due_at: at(3, "09:00"), is_demo: true },
    { user_id: userId, title: "Draft homepage wireframes (sample)", priority: "medium", status: "in_progress", due_at: at(6, "17:00"), business_id: b, project_id: project?.id ?? null, is_demo: true },
    { user_id: userId, title: "Call the bank about card limit (sample)", priority: "low", is_demo: true },
  ], { defaultToNull: false }));
  await must(supabase.from("calendar_events").insert([
    { user_id: userId, title: "Team stand-up (sample)", kind: "meeting", starts_at: at(0, "08:30"), ends_at: at(0, "08:45"), timezone: tz, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", business_id: b, reminder_offsets: [10], is_demo: true },
    { user_id: userId, title: "Client review meeting (sample)", kind: "meeting", starts_at: at(1, "10:00"), ends_at: at(1, "11:00"), timezone: tz, location: "Online", business_id: b, reminder_offsets: [15], is_demo: true },
    { user_id: userId, title: "Dentist appointment (sample)", kind: "appointment", starts_at: at(2, "14:00"), ends_at: at(2, "14:45"), timezone: tz, location: "City clinic", reminder_offsets: [60], is_demo: true },
  ], { defaultToNull: false }));
  await must(supabase.from("email_messages").insert([
    {
      user_id: userId, source: "demo", is_demo: true, from_name: "Sample Client Ltd", from_email: "client@example.com", subject: "Sample: Project kickoff next week",
      body_text: `Hi,\n\nThanks for the proposal. Could we meet on ${d(4)} at 10:00 to kick off the project? Please also confirm whether the first invoice of USD 750 will be due by ${d(14)}.\n\nRegards,\nSample Client`,
      snippet: "Thanks for the proposal. Could we meet to kick off the project?", is_unread: true, is_important: true, awaiting_reply: true, received_at: new Date(Date.now() - 3 * 3600_000).toISOString(), business_id: b,
    },
    {
      user_id: userId, source: "demo", is_demo: true, from_name: "Sample Utility Co", from_email: "billing@example.com", subject: "Sample: Your invoice is ready",
      body_text: `Your invoice number INV-88812 for USD 50.00 is due on ${d(6)}. Please pay before the due date to avoid interruption.`,
      snippet: "Your invoice number INV-88812 for USD 50.00 is due…", is_unread: true, is_important: false, received_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
    },
  ], { defaultToNull: false }));
  await supabase.rpc("log_audit", { p_action: "demo_data_loaded" });
}

export async function clearDemoData(supabase: SupabaseClient, userId: string) {
  for (const t of ["transactions", "budgets", "bills", "tasks", "calendar_events", "email_messages", "projects", "businesses"]) {
    const { error } = await supabase.from(t).delete().eq("user_id", userId).eq("is_demo", true);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  await supabase.from("scheduled_reminders").delete().eq("user_id", userId).eq("status", "pending");
  await supabase.rpc("log_audit", { p_action: "demo_data_cleared" });
}
