"use client";
import { Select } from "@/components/ui/input";
import { useLookups } from "@/components/layout/lookups";
import { SUPPORTED_CURRENCIES } from "@/lib/money";

export function ScopeSelect({ name = "business_id", defaultValue, id, allowAll, onChange }: { name?: string; defaultValue?: string | null; id?: string; allowAll?: boolean; onChange?: (v: string) => void }) {
  const { businesses } = useLookups();
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? (allowAll ? "" : "personal")} onChange={(e) => onChange?.(e.target.value)}>
      {allowAll ? <option value="">All (personal + businesses)</option> : null}
      <option value="personal">Personal</option>
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </Select>
  );
}

export function CategorySelect({ kind, scope, name = "category_id", defaultValue, id, includeEmpty = true }: { kind?: "income" | "expense"; scope?: string | null; name?: string; defaultValue?: string | null; id?: string; includeEmpty?: boolean }) {
  const { categories } = useLookups();
  const visible = categories.filter(
    (c) => (!kind || c.kind === kind) && (!c.business_id || !scope || scope === c.business_id),
  );
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? ""} key={`${kind}-${scope}`}>
      {includeEmpty ? <option value="">Uncategorised</option> : null}
      {visible.map((c) => (
        <option key={c.id} value={c.id}>{c.name}{c.business_id ? " (business)" : ""}</option>
      ))}
    </Select>
  );
}

export function CurrencySelect({ name = "currency", defaultValue, id }: { name?: string; defaultValue?: string; id?: string }) {
  const { currency } = useLookups();
  const value = defaultValue ?? currency;
  const list = SUPPORTED_CURRENCIES.includes(value as (typeof SUPPORTED_CURRENCIES)[number]) ? SUPPORTED_CURRENCIES : [value, ...SUPPORTED_CURRENCIES];
  return (
    <Select id={id} name={name} defaultValue={value}>
      {list.map((c) => <option key={c} value={c}>{c}</option>)}
    </Select>
  );
}

export function ProjectSelect({ name = "project_id", defaultValue, id, businessId }: { name?: string; defaultValue?: string | null; id?: string; businessId?: string | null }) {
  const { projects } = useLookups();
  const biz = businessId && businessId !== "personal" ? businessId : null;
  const visible = projects.filter((p) => (p.business_id ?? null) === biz);
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? ""}>
      <option value="">No project</option>
      {visible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select>
  );
}

export function ContactSelect({ name = "contact_id", defaultValue, id, businessId, placeholder = "None" }: { name?: string; defaultValue?: string | null; id?: string; businessId?: string | null; placeholder?: string }) {
  const { contacts } = useLookups();
  const visible = contacts.filter((c) => !businessId || businessId === "personal" || !c.business_id || c.business_id === businessId);
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? ""}>
      <option value="">{placeholder}</option>
      {visible.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>)}
    </Select>
  );
}

const OFFSETS = [
  { v: 0, label: "At time" },
  { v: 10, label: "10 min" },
  { v: 15, label: "15 min" },
  { v: 30, label: "30 min" },
  { v: 60, label: "1 hour" },
  { v: 180, label: "3 hours" },
  { v: 1440, label: "1 day" },
  { v: 2880, label: "2 days" },
];

/** Reminder lead-time picker; submitted as reminder_offsets[] (minutes before). */
export function ReminderOffsets({ defaultValue }: { defaultValue: number[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Remind me before</legend>
      <input type="hidden" name="has_reminders" value="1" />
      <div className="flex flex-wrap gap-1.5">
        {OFFSETS.map((o) => (
          <label key={o.v} className="cursor-pointer">
            <input type="checkbox" name="reminder_offsets[]" value={o.v} defaultChecked={defaultValue.includes(o.v)} className="peer sr-only" />
            <span className="inline-block rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const REPEAT_OPTIONS = [
  { v: "none", label: "Does not repeat" },
  { v: "daily", label: "Daily" },
  { v: "weekdays", label: "Every weekday" },
  { v: "weekly", label: "Weekly" },
  { v: "monthly", label: "Monthly" },
  { v: "yearly", label: "Yearly" },
];
