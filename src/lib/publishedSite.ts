import { client } from "./supabase";
export type SiteElement = { tag: string; id: string; classes: string[]; text: string; fullText?: string; domPath?: string; childCount?: number; background: string; x: number; y: number; width: number; height: number };
export async function publishedSite(repository: string, signal: AbortSignal, changes?: { path: string; content: string }[]) {
  if (!import.meta.env.DEV) throw new Error("Published website capture requires the local portal server. A production capture worker has not been configured.");
  const { data: { session } } = await client().auth.getSession();
  if (!session) throw new Error("Sign in to inspect the repository website");
  const response = await fetch("/api/jarvis/site", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ repository, mode: changes ? "capture" : "inspect", changes }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Published website capture failed");
  return result as { website: string; elements: SiteElement[]; screenshot: string };
}
