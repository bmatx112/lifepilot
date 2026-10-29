"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Download, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ActionButton } from "@/components/ui/form";
import { loadDemoData, removeDemoData } from "@/app/actions/data";

export function DataView({ email, demoLoaded }: { email: string; demoLoaded: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const del = async () => {
    setBusy(true);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error);
    router.replace("/login?deleted=1");
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" /> Demo mode</CardTitle><CardDescription>Load realistic sample records to explore the app. Every sample is labelled “Demo” and is never presented as real connected data.</CardDescription></div></CardHeader>
        <CardContent>
          {demoLoaded
            ? <ActionButton variant="outline" action={removeDemoData} confirm={{ title: "Remove all demo data?", description: "Only records marked as demo are deleted." }} confirmLabel="Remove"><Trash2 /> Remove demo data</ActionButton>
            : <ActionButton variant="outline" action={loadDemoData}><FlaskConical /> Load demo data</ActionButton>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><Database className="size-4" /> Export your data</CardTitle><CardDescription>Download everything stored for your account. OAuth tokens are never exported.</CardDescription></div></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href="/api/export/account" className={buttonVariants({ variant: "outline" })}><Download /> Full export (JSON)</a>
          <a href="/api/export/transactions?scope=all" className={buttonVariants({ variant: "outline" })}><Download /> All transactions (CSV)</a>
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader><div><CardTitle className="text-destructive">Delete account</CardTitle><CardDescription>Permanently deletes your account, all records, uploaded files and connected integrations. This cannot be undone.</CardDescription></div></CardHeader>
        <CardContent><Button variant="destructive" onClick={() => setDeleting(true)}><Trash2 /> Delete my account</Button></CardContent>
      </Card>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent title="Delete your account permanently?" description="Consider exporting your data first.">
          <div className="space-y-3">
            <Field label={`Type ${email} to confirm`} htmlFor="del-confirm"><Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="destructive" disabled={busy || confirm.trim().toLowerCase() !== email.toLowerCase()} onClick={del}>Delete forever</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
