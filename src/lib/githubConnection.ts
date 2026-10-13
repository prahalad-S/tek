import { client } from "./supabase";
import type { WorkspaceFiles } from "./editorGithub";
export type GitHubConnection = {
  ready: boolean;
  repository: string;
  defaultBranch?: string;
  message: string;
  missing?: string[];
};
export type GitHubWorkspace = {
  repository: string;
  branch: string;
  commitSha: string;
  files: WorkspaceFiles;
};
export async function githubRequest<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const {
    data: { session },
  } = await client().auth.getSession();
  if (!session)
    throw new Error("Sign into your live portal account to connect GitHub.");
  const { data, error } = await client().functions.invoke("github-editor", {
    body, signal,
  });
  if (error) {
    let message =
      "Could not reach the secure GitHub connection. Your editor files are preserved. Check GitHub before retrying a push.";
    try {
      message = (await error.context?.json())?.error ?? message;
    } catch {
      /* Keep a safe fallback for network errors. */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (body.action !== "status" && data?.ready === false)
    throw new Error(data.message);
  return data as T;
}
export function validGitHubWorkspace(value: unknown): value is GitHubWorkspace {
  if (!value || typeof value !== "object") return false;
  const item = value as GitHubWorkspace;
  return (
    typeof item.repository === "string" &&
    /^[\w-]+\/[\w.-]+$/.test(item.repository) &&
    typeof item.branch === "string" &&
    !!item.branch &&
    typeof item.commitSha === "string" &&
    /^[a-f0-9]{40}$/i.test(item.commitSha) &&
    !!item.files &&
    typeof item.files === "object" &&
    !Array.isArray(item.files) &&
    Object.values(item.files).every((content) => typeof content === "string")
  );
}
