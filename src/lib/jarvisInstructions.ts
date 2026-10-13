import { simpleTask } from "./simpleTasks";
import type { WorkspaceFiles } from "./editorGithub";
export function parseJarvisInstruction(value: string) {
  const text = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bgit\s+hub\b/gi, "GitHub")
    .replace(/^(?:hey\s+)?jarvis\s*[:,\-]?\s*/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?,]+$/, "")
    .trim();
  const previewOnly = text.match(
    /(?:\s+and\s+|,\s*)(?:preview only|do not (?:push|publish)|without (?:pushing|publishing))$/i,
  );
  const publish = text.match(
    /(?:\s+and\s+|,\s*)(?:update\s+(?:(?:the|my)\s+)?(?:repo(?:sitory)?|github(?:\s+repo(?:sitory)?)?)|push\s+(?:(?:the|my)\s+)?(?:changes\s+)?(?:to\s+)?(?:(?:the|my)\s+)?(?:repo(?:sitory)?|github(?:\s+repo(?:sitory)?)?)|commit\s+(?:the\s+changes\s+)?and\s+push(?:\s+to\s+github)?)(?:\s+please)?$/i,
  );
  const command = (
    previewOnly
      ? text.slice(0, previewOnly.index)
      : publish
        ? text.slice(0, publish.index)
        : text
  )
    .trim()
    .replace(/[.!?,]+$/, "")
    .trim()
    .replace(/^(?:finish\s+(?:(?:the|my)\s+)?task\s+by\s+|by\s+)/i, "")
    .replace(/^adding\s+/i, "add ");
  if (!command)
    throw new Error(
      "Describe the change, for example: Change the background color to red and update the repo.",
    );
  return { command, publish: !previewOnly };
}
export function planJarvisInstruction(
  command: string,
  files: WorkspaceFiles,
  selected: string,
) {
  const heading =
    /^(?:set|change|add)\s+(?:(?:a|the|page)\s+)?(?:heading|h1)\b/i.test(
      command,
    );
  const candidates = Object.keys(files).filter((path) =>
    heading ? /\.html?$/i.test(path) : /\.css$/i.test(path),
  );
  let target =
    candidates.length === 1
      ? candidates[0]
      : candidates.includes(selected)
        ? selected
        : "";
  if (!heading && !candidates.length) {
    const html = Object.keys(files).filter((path) => /\.html?$/i.test(path));
    target =
      html.length === 1 ? html[0] : html.includes(selected) ? selected : "";
  }
  if (!target)
    throw new Error(
      `Select the ${heading ? "HTML" : "CSS"} file to change in the editor, then give your command again.`,
    );
  return simpleTask(command, { [target]: files[target] });
}
