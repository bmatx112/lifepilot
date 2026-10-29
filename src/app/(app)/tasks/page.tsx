import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { TasksView } from "@/components/tasks/tasks-view";
import type { Project, Task } from "@/lib/types";

export const metadata = { title: "Tasks" };

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const since = daysAgoIso(30);
  const [open, done, projects, focus] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", user.id).in("status", ["pending", "in_progress"]).is("parent_task_id", null).order("due_at", { ascending: true, nullsFirst: false }).limit(1000),
    supabase.from("tasks").select("*").eq("user_id", user.id).in("status", ["completed", "cancelled"]).is("parent_task_id", null).gte("updated_at", since).order("completed_at", { ascending: false }).limit(300),
    supabase.from("projects").select("*").eq("user_id", user.id).order("status").order("name"),
    typeof sp.task === "string" ? supabase.from("tasks").select("*").eq("user_id", user.id).eq("id", sp.task).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <PageHeader title="Tasks" description="Personal and business tasks, projects and deadlines." />
      <TasksView tasks={[...((open.data ?? []) as Task[]), ...((done.data ?? []) as Task[])]} projects={(projects.data ?? []) as Project[]} focusTask={(focus.data as Task | null) ?? null} />
    </>
  );
}
