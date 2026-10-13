import storedJiraPhrases from "../config/jarvis-jira-phrases.txt?raw";
import { client } from "./supabase";
export type JiraAssignedIssue = { key: string; summary: string; status: string; url: string; project?: string; description?: string; updated?: string | null; reporter?: { name: string; email: string }; assignor?: { name: string; email: string } | null };
export type JiraUpdate = { issueKey: string; status: string; comment: string; summary: string; url: string };
export async function jiraRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await client().auth.getSession();
  if (!session) throw new Error("Sign into your live portal account to update Jira.");
  const { data, error } = await client().functions.invoke("jira", { body, signal });
  if (error) {
    let message = "Jira did not confirm this operation. Check the ticket before retrying.";
    try { message = (await error.context?.json())?.error ?? message; } catch { /* Keep the safe network fallback. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const jiraCanonicalCommand = 'Add comment "the issue has been fixed" and move the status to In Testing';
function normalizePhrase(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
}
function normalizeCommand(value: string) {
  return normalizePhrase(value).replace(/^(?:(?:jarvis|please)\s+)+/, "");
}
const acceptedPhrases = new Set(storedJiraPhrases.split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith("#")).map(normalizeCommand));
// Compare only against explicitly allowed commands. Never correct ticket IDs.
function matchesSavedPhrase(phrase: string) {
  if (acceptedPhrases.has(phrase)) return true;
  if (phrase.length < 12 || phrase.length > 500) return false;
  for (const allowed of acceptedPhrases) {
    const limit = Math.min(8, Math.floor(Math.max(phrase.length, allowed.length) * 0.12));
    if (!limit || Math.abs(phrase.length - allowed.length) > limit) continue;
    let row = Array.from({ length: allowed.length + 1 }, (_, index) => index);
    for (let i = 1; i <= phrase.length; i++) {
      const next = [i];
      for (let j = 1; j <= allowed.length; j++) {
        next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (phrase[i - 1] === allowed[j - 1] ? 0 : 1));
      }
      row = next;
    }
    if (row[allowed.length] <= limit) return true;
  }
  return false;
}
export function parseJiraTask(instruction: string) {
  const text = instruction.trim().replace(/\s+/g, " ");
  const keyPattern = /\b[A-Z][A-Z0-9_]*\s*-\s*[1-9][0-9]*\b/gi;
  const keys = [...new Set((text.match(keyPattern) ?? []).map(key => key.replace(/\s/g, "").toUpperCase()))];
  if (keys.length > 1) throw new Error("Specify one Jira issue per command.");
  // Never fuzzy-match issue IDs or negate an instruction into a write operation.
  const normalized = normalizePhrase(text);
  if (/\b(?:don't|do not|not|never|without|cancel|stop)\b/.test(normalized)) {
    throw new Error("No Jira update was submitted. Give an affirmative comment and status-change command.");
  }
  const phrase = normalizeCommand(text.replace(keyPattern, " "));
  const storedMatch = matchesSavedPhrase(phrase);
  const standardMatch = /\bcomment(?:ing)?\b/i.test(text) && /\bthe issue has been fixed\b/i.test(text)
    && /\bin testing\b/i.test(text) && /\b(?:status|move|change|transition)\b/i.test(text);
  const shortComment = /\b(?:add\s+comments?|comment|comments|type\s+comments?|write\s+comments?)\b/.test(phrase);
  const shortStatus = /\b(?:move|more|change)\b/.test(phrase) && /\b(?:in testing|intesting|interesting)\b/.test(phrase);
  const contextual = /^(?:do what you have to do|you know what to do)$/.test(phrase);
  if (!storedMatch && !standardMatch && !(shortComment && shortStatus) && !contextual) {
    throw new Error(`Command not recognized. I heard: "${text}". Add this exact text to src/config/jarvis-jira-phrases.txt or type: Add comments and move status to In Testing. No update was submitted.`);
  }
  return { issueKey: keys[0] ?? null, matchedStoredPhrase: storedMatch, automaticComment: !/\b(?:the )?issue has been fixed\b/i.test(text) };
}
