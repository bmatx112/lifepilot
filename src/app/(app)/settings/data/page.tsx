import { requireUser } from "@/lib/auth";
import { DataView } from "@/components/settings/data-view";

export const metadata = { title: "Data & privacy" };

export default async function DataPage() {
  const { supabase, user } = await requireUser();
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_demo", true);
  return <DataView email={user.email ?? ""} demoLoaded={(count ?? 0) > 0} />;
}
