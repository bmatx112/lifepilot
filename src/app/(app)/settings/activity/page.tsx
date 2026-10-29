import { requireUser } from "@/lib/auth";
import { fmt } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import type { AiActionLog } from "@/lib/types";

export const metadata = { title: "Activity log" };

export default async function ActivityPage() {
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const [ai, audit] = await Promise.all([
    supabase.from("ai_action_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("audit_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>AI actions</CardTitle><CardDescription>Everything the assistant proposed, and what you decided.</CardDescription></div></CardHeader>
        <CardContent>
          {(ai.data ?? []).length ? (
            <ul className="divide-y divide-border">
              {((ai.data ?? []) as AiActionLog[]).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0"><p>{a.summary}</p><p className="text-xs text-muted-foreground">{a.tool_name} · {fmt(a.created_at, tz, "d MMM yyyy HH:mm")}{a.error ? ` · ${a.error}` : ""}</p></div>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No AI actions yet" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Audit trail</CardTitle><CardDescription>Changes to financial records, integrations, exports and security events.</CardDescription></div></CardHeader>
        <CardContent>
          {(audit.data ?? []).length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">Action</th><th className="py-1 pr-3 font-medium">Record</th><th className="py-1 font-medium">Details</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {(audit.data ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-xs tabular text-muted-foreground">{fmt(a.created_at, tz, "d MMM HH:mm")}</td>
                      <td className="py-1.5 pr-3">{a.action.replace(/_/g, " ")}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{a.entity_type ?? "—"}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{[a.metadata?.title, a.metadata?.amount && `${a.metadata.currency ?? ""} ${a.metadata.amount}`, a.metadata?.provider].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No audit entries yet" />}
        </CardContent>
      </Card>
    </div>
  );
}
