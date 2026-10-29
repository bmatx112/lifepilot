"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleAlert, Link2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { ActionButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useLookups } from "@/components/layout/lookups";
import { disconnectAccount, syncAccountNow, updateAccountSync } from "@/app/actions/integrations";
import { fmt } from "@/lib/dates";
import type { EmailAccount } from "@/lib/types";
import type { FeatureStatus } from "@/lib/env";

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 py-2 text-sm">
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
      <div><p className="font-medium">{label} <Badge tone={ok ? "success" : "warning"}>{ok ? "configured" : "not configured"}</Badge></p><p className="text-xs text-muted-foreground">{detail}</p></div>
    </li>
  );
}

export function IntegrationsView({ accounts, features, appUrl, scopes, connected, error }: {
  accounts: EmailAccount[]; features: FeatureStatus; appUrl: string; scopes: Record<"google" | "microsoft", string[]>; connected: string | null; error: string | null;
}) {
  const { timezone } = useLookups();
  const router = useRouter();
  useEffect(() => {
    if (connected) toast.success(`${connected === "google" ? "Google" : "Microsoft"} account connected`);
    if (error) toast.error(error, { duration: 10000 });
    if (connected || error) router.replace("/settings/integrations");
  }, [connected, error, router]);

  const providers = [
    { id: "google" as const, name: "Google", desc: "Gmail (read metadata, create drafts, send on request) and Google Calendar (two-way sync).", configured: features.google, redirect: `${appUrl}/api/integrations/google/callback` },
    { id: "microsoft" as const, name: "Microsoft", desc: "Outlook mail (read, drafts, send on request) and Outlook Calendar (two-way sync).", configured: features.microsoft, redirect: `${appUrl}/api/integrations/microsoft/callback` },
  ];

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger" title="Connection failed">{error}</Alert> : null}
      {providers.map((p) => {
        const mine = accounts.filter((a) => a.provider === p.id);
        return (
          <Card key={p.id}>
            <CardHeader>
              <div><CardTitle>{p.name}</CardTitle><CardDescription>{p.desc}</CardDescription></div>
              {p.configured ? (
                <a href={`/api/integrations/${p.id}/connect`} className={buttonVariants({ size: "sm", variant: mine.length ? "outline" : "accent" })}><Link2 /> {mine.length ? "Connect another" : "Connect"}</a>
              ) : <Badge tone="warning">Server not configured</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              {!p.configured ? (
                <Alert tone="info" title="Setup required by the app administrator">
                  Create OAuth credentials and set <code>{p.id === "google" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET"}</code> and <code>TOKEN_ENCRYPTION_KEY</code>. Redirect URI: <code className="break-all">{p.redirect}</code>. See the README for step-by-step instructions. Until then, use the manual email workflow on the Email page.
                </Alert>
              ) : null}
              {mine.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{a.email_address} <Badge tone={statusTone(a.status)}>{a.status}</Badge></p>
                      <p className="text-xs text-muted-foreground">
                        Mail synced {a.last_mail_sync_at ? fmt(a.last_mail_sync_at, timezone, "d MMM HH:mm") : "never"} · Calendar synced {a.last_calendar_sync_at ? fmt(a.last_calendar_sync_at, timezone, "d MMM HH:mm") : "never"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <ActionButton size="sm" variant="outline" action={() => syncAccountNow(a.id)}><RefreshCw /> Sync now</ActionButton>
                      <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => disconnectAccount(a.id)} confirm={{ title: `Disconnect ${a.email_address}?`, description: "Access is revoked, tokens are deleted, and synced email metadata and synced calendar events are removed from LifePilot. Your mailbox and calendar are not changed." }} confirmLabel="Disconnect"><Unlink /> Disconnect</ActionButton>
                    </div>
                  </div>
                  {a.last_error ? <p className="mt-2 text-xs text-destructive">{a.last_error}{a.status === "error" ? " — use Connect to re-authorise." : ""}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-4">
                    <Checkbox defaultChecked={a.mail_sync_enabled} label="Sync mail" onChange={async (e) => { const r = await updateAccountSync(a.id, { mail_sync_enabled: e.target.checked }); if (r.ok) toast.success(r.message); else toast.error(r.error); }} />
                    <Checkbox defaultChecked={a.calendar_sync_enabled} label="Sync calendar" onChange={async (e) => { const r = await updateAccountSync(a.id, { calendar_sync_enabled: e.target.checked }); if (r.ok) toast.success(r.message); else toast.error(r.error); }} />
                  </div>
                </div>
              ))}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Permissions requested</summary>
                <ul className="mt-1 list-disc pl-5">{scopes[p.id].map((s) => <li key={s}><code>{s}</code></li>)}</ul>
                <p className="mt-1">LifePilot never deletes email, changes mailbox settings, or sends anything without your explicit confirmation. Tokens are encrypted and stored server-side only.</p>
              </details>
            </CardContent>
          </Card>
        );
      })}
      <Card>
        <CardHeader><div><CardTitle>Other services</CardTitle><CardDescription>Server-side configuration status (no secrets shown).</CardDescription></div></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            <StatusRow ok={features.ai} label="AI assistant (OpenAI)" detail="Enables the assistant, AI briefings, email summaries/extraction and reply drafts. Pay-as-you-go usage on your OpenAI account." />
            <StatusRow ok={features.push} label="Web Push (VAPID)" detail="Free. Enables push notifications on desktop, Android and installed iOS apps." />
            <StatusRow ok={features.emailReminders} label="Email reminders (Resend)" detail="Optional. Free tier available; sends reminder emails." />
            <StatusRow ok={features.serviceRole} label="Server jobs (Supabase service role)" detail="Required for scheduled reminders, integrations and account deletion." />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
