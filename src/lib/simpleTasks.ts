import type { WorkspaceFiles } from "./editorGithub";
export type SimplePlan = {
  summary: string;
  changes: { path: string; content: string; reason: string }[];
};
const start = "/* Jarvis simple-task styles */";
const end = "/* End Jarvis simple-task styles */";
function styleProposal(
  files: WorkspaceFiles,
  rules: string,
  summary: string,
): SimplePlan {
  const css = Object.keys(files).filter((path) => /\.css$/i.test(path));
  const html = Object.keys(files).filter((path) => /\.html?$/i.test(path));
  if (css.length > 1 || (!css.length && html.length !== 1))
    throw new Error(
      "Select exactly one CSS file, or one HTML file with embedded styles, for this task.",
    );
  const path = css[0] ?? html[0];
  const original = files[path];
  const block = `${start}\n${rules}\n${end}`;
  let content: string;
  if (css.length) {
    const a = original.indexOf(start),
      b = original.indexOf(end, a);
    content =
      a >= 0 && b >= a
        ? original.slice(0, a) + block + original.slice(b + end.length)
        : original + "\n\n" + block + "\n";
  } else {
    const tag = '<style id="jarvis-simple-task">' + block + "</style>";
    const pattern =
      /<style\s+id=["']jarvis-simple-task["'][^>]*>[\s\S]*?<\/style>/i;
    content = pattern.test(original)
      ? original.replace(pattern, () => tag)
      : /<\/head\s*>/i.test(original)
        ? original.replace(/<\/head\s*>/i, () => tag + "\n</head>")
        : tag + "\n" + original;
  }
  return {
    summary,
    changes:
      content === original
        ? []
        : [
            {
              path,
              content,
              reason:
                "Apply a predefined CSS recipe. Existing styles are retained; review cascade effects in the preview.",
            },
          ],
  };
}
export function simpleTask(message: string, files: WorkspaceFiles): SimplePlan {
  const text = message
    .trim()
    .replace(/^jarvis\s*[:,\-]?\s*/i, "")
    .replace(/[.!?,]+$/, "")
    .trim();
  if (
    /^(?:make (?:the |my )?(?:page|site|website) dark|(?:add |enable |apply )?dark (?:mode|theme))$/i.test(
      text,
    )
  )
    return styleProposal(
      files,
      "html { color-scheme: dark; }\nbody { background: #111827; color: #f3f4f6; }\np { color: #cbd5e1; }\na { color: #93c5fd; }\ninput, textarea, select { background: #1f2937; color: #f3f4f6; border-color: #475569; }",
      "Apply the dark-mode recipe",
    );
  if (
    /^(?:make (?:the |my )?(?:page|site|website) light|(?:add |enable |apply )?light (?:mode|theme))$/i.test(
      text,
    )
  )
    return styleProposal(
      files,
      "html { color-scheme: light; }\nbody { background: #f8fafc; color: #0f172a; }\np { color: #475569; }\na { color: #1d4ed8; }\ninput, textarea, select { background: #ffffff; color: #0f172a; border-color: #cbd5e1; }",
      "Apply the light-mode recipe",
    );
  const background = text.match(
    /^(?:set|change|add|make) (?:a |the |page )?background(?: colou?r)?(?: to| of| as| into)? (#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+(?: [a-z]+)?)$/i,
  );
  if (background) {
    const colors: Record<string, string> = {
      red: "#ff0000",
      blue: "#0000ff",
      green: "#008000",
      black: "#000000",
      white: "#ffffff",
      yellow: "#ffff00",
      orange: "#ffa500",
      purple: "#800080",
      pink: "#ffc0cb",
      gray: "#808080",
      grey: "#808080",
      teal: "#008080",
      navy: "#000080",
      "navy blue": "#000080",
      brown: "#a52a2a",
      cyan: "#00ffff",
      magenta: "#ff00ff",
      "light blue": "#add8e6",
      lightblue: "#add8e6",
      "dark blue": "#00008b",
      darkblue: "#00008b",
      "light gray": "#d3d3d3",
      "light grey": "#d3d3d3",
      transparent: "transparent",
    };
    const requested = background[1].toLowerCase();
    const color = requested.startsWith("#") ? requested : colors[requested];
    if (!color)
      throw new Error(
        "Use a supported color such as red, blue, green, light blue, black, white, or a hex color.",
      );
    return styleProposal(
      files,
      `body { background: ${color}; }`,
      `Set the page background to ${requested}`,
    );
  }
  const addHeading = text.match(/^add (?:a |the )?heading(?: to)? (.+)$/i);
  if (addHeading) {
    const html = Object.keys(files).filter((path) => /\.html?$/i.test(path));
    if (html.length !== 1) throw new Error("Select exactly one HTML file.");
    const path = html[0],
      original = files[path];
    if (/<h1\b/i.test(original))
      throw new Error(
        "A heading already exists. Use Change heading to Welcome.",
      );
    if (!/<body\b[^>]*>/i.test(original))
      throw new Error("The HTML needs a body element before adding a heading.");
    const value = addHeading[1].replace(/^(["'])([\s\S]*)\1$/, "$2");
    if (!value.trim() || value.length > 200)
      throw new Error("Use heading text between 1 and 200 characters.");
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return {
      summary: "Add a page heading",
      changes: [
        {
          path,
          content: original.replace(
            /<body\b[^>]*>/i,
            (tag) => tag + "\n<h1>" + escaped + "</h1>",
          ),
          reason: "Add an escaped h1 heading at the start of the page body.",
        },
      ],
    };
  }
  const heading = text.match(
    /^(?:set|change) (?:the |page )?(?:heading|h1) to (.+)$/i,
  );
  if (heading) {
    const html = Object.keys(files).filter((path) => /\.html?$/i.test(path));
    if (html.length !== 1)
      throw new Error("Select exactly one HTML file for the heading change.");
    const path = html[0];
    if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(files[path]))
      throw new Error(
        "The selected HTML has no h1 heading. Try Add heading Welcome. No changes were made.",
      );
    const value = heading[1].replace(/^(["'])([\s\S]*)\1$/, "$2");
    if (!value.trim() || value.length > 200)
      throw new Error("Use heading text between 1 and 200 characters.");
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const content = files[path].replace(
      /(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i,
      (_all, open, close) => open + escaped + close,
    );
    return {
      summary: "Replace the first h1 heading",
      changes:
        content === files[path]
          ? []
          : [
              {
                path,
                content,
                reason:
                  "Keep the first heading's attributes and replace its inner content with escaped text.",
              },
            ],
    };
  }
  throw new Error(
    "This no-key mode supports predefined commands only. Try “Make the page dark”, “Make the page light”, “Set background to #e0f2fe”, or “Change heading to Welcome”. Other tasks require manual editing or an AI model.",
  );
}
