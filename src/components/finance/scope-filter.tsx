"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { useLookups } from "@/components/layout/lookups";

/** Personal / business / consolidated scope switcher stored in the URL. */
export function ScopeFilter({ defaultScope = "personal" }: { defaultScope?: string }) {
  const { businesses } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const value = sp.get("scope") ?? defaultScope;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">View</span>
      <Select className="h-9 w-auto min-w-44" value={value} onChange={(e) => {
        const q = new URLSearchParams(sp.toString());
        q.set("scope", e.target.value);
        q.delete("page");
        router.push(`${pathname}?${q}`);
      }}>
        <option value="personal">Personal only</option>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="all">Consolidated (all)</option>
      </Select>
    </label>
  );
}
