"use client";
import { useState } from "react";
import { BellRing, CalendarPlus, ListTodo, Plus, Receipt, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { TransactionDialog } from "@/components/finance/forms";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { EventDialog } from "@/components/calendar/event-dialog";
import { ReminderDialog } from "@/components/tasks/reminder-dialog";

type Kind = "expense" | "income" | "task" | "event" | "reminder" | null;

export function useQuickActions() {
  const [open, setOpen] = useState<Kind>(null);
  const dialogs = (
    <>
      {open === "expense" || open === "income" ? (
        <TransactionDialog open onOpenChange={(o) => !o && setOpen(null)} defaults={{ type: open }} />
      ) : null}
      {open === "task" ? <TaskDialog open onOpenChange={(o) => !o && setOpen(null)} /> : null}
      {open === "event" ? <EventDialog open onOpenChange={(o) => !o && setOpen(null)} /> : null}
      {open === "reminder" ? <ReminderDialog open onOpenChange={(o) => !o && setOpen(null)} /> : null}
    </>
  );
  return { open: setOpen, dialogs };
}

export function QuickAddMenu({ onAsk }: { onAsk: () => void }) {
  const qa = useQuickActions();
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="accent" size="sm" aria-label="Quick add">
            <Plus /> <span className="hidden sm:inline">New</span>
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => qa.open("expense")}><Receipt /> Add expense</DropdownItem>
          <DropdownItem onSelect={() => qa.open("income")}><TrendingUp /> Add income</DropdownItem>
          <DropdownItem onSelect={() => qa.open("task")}><ListTodo /> Create task</DropdownItem>
          <DropdownItem onSelect={() => qa.open("event")}><CalendarPlus /> Schedule meeting</DropdownItem>
          <DropdownItem onSelect={() => qa.open("reminder")}><BellRing /> Set reminder</DropdownItem>
          <DropdownItem onSelect={onAsk}><Sparkles /> Ask the assistant</DropdownItem>
        </DropdownContent>
      </Dropdown>
      {qa.dialogs}
    </>
  );
}

/** Large quick-action buttons for the dashboard. */
export function QuickActionButtons({ onAsk }: { onAsk?: () => void }) {
  const qa = useQuickActions();
  const items = [
    { k: "expense" as const, icon: <Receipt />, label: "Add expense" },
    { k: "task" as const, icon: <ListTodo />, label: "Create task" },
    { k: "event" as const, icon: <CalendarPlus />, label: "Schedule meeting" },
    { k: "reminder" as const, icon: <BellRing />, label: "Set reminder" },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((i) => (
          <button key={i.k} onClick={() => qa.open(i.k)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium shadow-card transition hover:border-accent/50 hover:bg-accent-soft/40 [&_svg]:size-4 [&_svg]:text-accent">
            {i.icon} {i.label}
          </button>
        ))}
        <button
          onClick={() => (onAsk ? onAsk() : window.dispatchEvent(new CustomEvent("open-assistant")))}
          className="col-span-2 flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-card hover:opacity-90 sm:col-span-1 [&_svg]:size-4"
        >
          <Sparkles /> Ask assistant
        </button>
      </div>
      {qa.dialogs}
    </>
  );
}
