import { ButtonLink } from "@/components/ui/button";
import { Bell, CalendarDays, Mail, Sparkles, SquareCheckBig, Wallet } from "lucide-react";

const FEATURES = [
  { icon: Wallet, title: "Finance & budgets", text: "Income, expenses, bills and receivables in USD, ZWG and more — with budget alerts." },
  { icon: SquareCheckBig, title: "Tasks & projects", text: "Personal and business tasks with priorities, subtasks, kanban and recurring schedules." },
  { icon: CalendarDays, title: "Calendar", text: "Day, week, month and agenda views with conflict detection and Google/Outlook sync." },
  { icon: Mail, title: "Email intelligence", text: "Summaries, extracted deadlines and invoices, follow-ups — always reviewed by you." },
  { icon: Sparkles, title: "AI assistant", text: "Ask about your real records. Any change it proposes waits for your confirmation." },
  { icon: Bell, title: "Reliable reminders", text: "Server-scheduled push, in-app and email reminders that arrive even when the app is closed." },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_55%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">LP</span>LifePilot <span className="text-accent">AI</span></span>
        <div className="flex gap-2"><ButtonLink href="/login" variant="ghost" size="sm">Sign in</ButtonLink><ButtonLink href="/signup" size="sm">Get started</ButtonLink></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Your personal & business co-pilot.</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Manage money, businesses, tasks, meetings and email from one calm dashboard — with an assistant that works from your actual data.</p>
        <div className="mt-6 flex gap-2"><ButtonLink href="/signup" variant="accent" size="lg">Create free account</ButtonLink><ButtonLink href="/login" variant="outline" size="lg">Sign in</ButtonLink></div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 shadow-card">
              <f.icon className="size-5 text-accent" />
              <h2 className="mt-3 font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
