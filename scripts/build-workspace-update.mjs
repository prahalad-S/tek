import fs from "node:fs";
const checks = {
  "020":
    "not exists(select 1 from information_schema.columns where table_schema='public' and table_name='holidays' and column_name='locations')",
  "019": "to_regprocedure('public.export_employee_backup(uuid)') is null",
  "018": "to_regclass('public.workspace_note_shares') is null",
  "017": "to_regclass('public.workspace_notes') is null",
  "016":
    "to_regprocedure('public.save_employee_map(uuid,double precision,double precision,text,boolean,text[],uuid[])') is null",
  "015": "to_regclass('public.profile_editor_scopes') is null",
  "014":
    "to_regprocedure('public.admin_set_employee_avatar(uuid,text)') is null",
  "006": "to_regclass('public.employee_profiles') is null",
  "007": "to_regclass('public.calendar_access_requests') is null",
  "008":
    "to_regprocedure('public.save_calendar_item(text,jsonb,uuid)') is null",
  "009":
    "to_regprocedure('public.register_profile_document(uuid,text,text,text,bigint,text)') is null",
  "010":
    "to_regprocedure('public.calendar_leave_action(uuid,integer,text,date)') is null",
  "011": "to_regclass('private.calendar_undo') is null",
  "012": "to_regclass('public.employee_map_locations') is null",
  "013": "to_regclass('public.workspace_activity') is null",
};
let sql =
  "-- Tekzenit workspace update. Requires initial migrations 001–005.\n-- Applies missing updates 006–020; completed updates are skipped.\n-- No employee data or credentials. Run in the Supabase SQL Editor.\nBEGIN;\n";
for (const file of fs.readdirSync("supabase/migrations").sort()) {
  const n = file.slice(9, 12);
  if (!checks[n]) continue;
  sql += `\nDO $upgrade_${n}$ BEGIN IF ${checks[n]} THEN\nEXECUTE $migration_${n}$\n${fs.readFileSync("supabase/migrations/" + file, "utf8")}\n$migration_${n}$;\nEND IF; END $upgrade_${n}$;\n`;
}
sql += "\nCOMMIT;\n";
fs.writeFileSync("../Tekzenit-workspace-update.sql", sql);
