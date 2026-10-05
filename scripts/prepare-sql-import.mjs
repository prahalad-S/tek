import fs from "node:fs";
const data = JSON.parse(
  fs
    .readFileSync("private-migration/import.json", "utf8")
    .replace(/^\uFEFF/, ""),
);
const columns = {
  departments: ["id", "name"],
  employees: [
    "id",
    "email",
    "full_name",
    "employee_code",
    "title",
    "department_id",
    "location",
    "bio",
  ],
  skills: ["id", "name"],
  employee_skills: ["employee_id", "skill_id"],
  projects: ["id", "name", "description", "status"],
  holidays: ["id", "name", "day"],
};
const literal = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const out = [
  "-- PRIVATE: employee personal data. Do not commit, publish, or share this file.",
  "-- Run in the SQL Editor of Supabase project pyjmujnwtxdgwqowiezp only.",
  "-- Imports approved profiles and supporting records. No Auth accounts or calendar work entries.",
  "BEGIN;",
  "SET LOCAL standard_conforming_strings = on;",
];
for (const [table, fields] of Object.entries(columns)) {
  const rows = data[table];
  if (!rows?.length) continue;
  const fieldList = fields.join(", ");
  const conflict = table === "employee_skills" ? "employee_id, skill_id" : "id";
  out.push(
    `INSERT INTO public.${table} (${fieldList}) SELECT ${fieldList} FROM jsonb_populate_recordset(NULL::public.${table}, ${literal(rows)}) ON CONFLICT (${conflict}) DO NOTHING;`,
  );
}
out.push(
  `SELECT public.provision_imported_emails(${literal(data.pending_private)});`,
);
out.push("COMMIT;");
out.push(
  "SELECT (SELECT count(*) FROM public.employees) AS employees, (SELECT count(*) FROM private.allowed_emails WHERE enabled) AS provisioned_emails, (SELECT count(*) FROM public.projects) AS projects, (SELECT count(*) FROM public.time_entries) AS work_entries;",
);
fs.writeFileSync(
  "private-migration/Supabase-employee-import.sql",
  out.join("\n\n") + "\n",
);
console.log(
  "Private import SQL prepared. Employee records: " +
    data.employees.length +
    ". No personal values printed.",
);
