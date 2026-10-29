"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function BriefingCard({ content, generatedBy, aiEnabled }: { content: string; generatedBy: "ai" | "rules"; aiEnabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const regenerate = async () => {
    setBusy(true);
    const res = await fetch("/api/ai/briefing", { method: "POST" });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Could not generate briefing");
    router.refresh();
  };
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-[#13355f] p-4 text-white shadow-card dark:from-[#0f2440] dark:to-[#0b1a30] sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-teal-300" /> Daily briefing</h2>
        <div className="flex items-center gap-2">
          <Badge className="bg-white/10 text-white/80">{generatedBy === "ai" ? "AI-generated from your data" : "Summary from your data"}</Badge>
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10" onClick={regenerate} disabled={busy} aria-label="Refresh briefing" title={aiEnabled ? "Generate AI briefing" : "Refresh"}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{content}</p>
    </div>
  );
}
