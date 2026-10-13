export function isJarvisStopCommand(text: string): boolean {
  if (/^(?:let[’']?s\s+|let s\s+)?clear the issues[.!?]*$/i.test(text.trim())) return false;
  return /\b(?:no|stop|cancel|delete|clear)\b/i.test(text);
}
