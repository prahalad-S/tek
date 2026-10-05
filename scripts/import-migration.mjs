import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local shell. Never use VITE_ for privileged keys.",
  );
if (!process.argv.includes("--confirm-import"))
  throw new Error(
    "Review private-migration/report.json first, then run with --confirm-import. This imports employees/projects; it does not delete existing remote data.",
  );
const data = JSON.parse(
  fs
    .readFileSync("private-migration/import.json", "utf8")
    .replace(/^\uFEFF/, ""),
);
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const table of [
  "departments",
  "employees",
  "skills",
  "employee_skills",
  "projects",
  "holidays",
]) {
  const rows = data[table];
  if (!rows.length) continue;
  const { error } = await sb
    .from(table)
    .upsert(rows, { ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table}: ${rows.length} rows processed`);
}
const { error } = await sb.rpc("provision_imported_emails", {
  p_details: data.pending_private,
});
if (error) throw error;
console.log(
  "Import complete. No Auth accounts, passwords, legacy sessions or calendar history were imported. Provision Auth users through Supabase; keep email confirmation enabled.",
);
