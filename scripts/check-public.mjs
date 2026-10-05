import fs from "node:fs";
import path from "node:path";
const prohibited =
  /(employees|tasks|access_grants|employee-documents|emp-docs|legacy-data|private-backup|private-migration)/i;
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (prohibited.test(full))
      throw new Error(`Sensitive or legacy path in public output: ${full}`);
    if (item.isDirectory()) walk(full);
    else if (/\.json$/i.test(full))
      throw new Error(`JSON dataset must not ship publicly: ${full}`);
  }
}
walk("public");
walk("dist");
console.log(
  "Public asset check passed: no employee datasets, private backups, documents or legacy runtime.",
);
