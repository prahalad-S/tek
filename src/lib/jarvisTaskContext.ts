import { client } from "./supabase";
const prefix = "jarvis-completed-task:";
export async function rememberCompletedTask(summary: string, commitUrl?: string) {
  try {
    const { data: { session } } = await client().auth.getSession();
    if (!session) return;
    sessionStorage.setItem(prefix + session.user.id, JSON.stringify({ summary, commitUrl, completedAt: Date.now() }));
  } catch { /* Context storage must not affect a completed task. */ }
}
export async function completedTaskComment(): Promise<string | null> {
  try {
    const { data: { session } } = await client().auth.getSession();
    if (!session) return null;
    const raw = sessionStorage.getItem(prefix + session.user.id);
    if (!raw) return null;
    const task = JSON.parse(raw);
    if (typeof task.summary !== "string" || Date.now() - task.completedAt > 24 * 60 * 60 * 1000) return null;
    return `Jarvis task update: ${task.summary}${typeof task.commitUrl === "string" ? "\nCommit: " + task.commitUrl : ""}`;
  } catch { return null; }
}
