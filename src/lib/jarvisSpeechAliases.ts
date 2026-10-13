// Keep short ambiguous aliases restricted to the GitHub/source-selection context.
export function normalizeGitHubSpeech(text: string, githubContext = false) {
  let result = text
    .replace(/\bchat(?=\s+view\b)/gi, "chart")
    .replace(/\bsymbiosis\b/gi, "Symbiosys")
    .replace(/\b(?:git\s*hub|get\s+(?:hub|hab|her|up)|git\s+(?:hab|her)|github)\b/gi, "GitHub");
  if (githubContext && /^\s*(?:get|git|gethab|gether)[.!?]*\s*$/i.test(result)) result = "GitHub";
  return result;
}
