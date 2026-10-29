"use client";
import { useRef, useState } from "react";
import { Download, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/types";

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

/** Upload/list/delete files attached to a record (stored in the private storage bucket). */
export function Attachments({ entityType, entityId, businessId, initial, titlePrompt }: {
  entityType: "transaction" | "task" | "bill" | "event" | "business_document";
  entityId?: string | null;
  businessId?: string | null;
  initial: Attachment[];
  titlePrompt?: boolean;
}) {
  const [files, setFiles] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [lastInit, setLastInit] = useState(initial);
  if (initial !== lastInit) {
    setLastInit(initial);
    setFiles(initial);
  }

  const upload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast.error("Files must be 10 MB or smaller");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("entity_type", entityType);
    if (entityId) fd.set("entity_id", entityId);
    if (businessId) fd.set("business_id", businessId);
    if (titlePrompt) {
      const t = window.prompt("Document title", file.name.replace(/\.[^.]+$/, ""));
      if (t) fd.set("title", t);
    }
    setBusy(true);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Upload failed");
    setFiles((f) => [...f, json.attachment]);
    toast.success("File uploaded");
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this file?")) return;
    const res = await fetch(`/api/attachments?id=${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not delete file");
    setFiles((f) => f.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2">
      {files.length ? (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.title ?? f.file_name}</span>
              <span className="text-xs text-muted-foreground">{size(f.size_bytes)}</span>
              <a href={`/api/attachments?id=${f.id}`} className="rounded p-1 hover:bg-muted" aria-label={`Download ${f.file_name}`}><Download className="size-3.5" /></a>
              <button onClick={() => remove(f.id)} className="rounded p-1 text-destructive hover:bg-muted" aria-label={`Delete ${f.file_name}`}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <input ref={input} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach file
      </Button>
      <p className="text-[11px] text-muted-foreground">PDF, images, Office docs, TXT or CSV · max 10 MB · stored privately</p>
    </div>
  );
}
