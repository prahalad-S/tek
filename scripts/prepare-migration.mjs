import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const source = path.resolve("private-backup/legacy-data");
const output = path.resolve("private-migration");
fs.mkdirSync(output, { recursive: true });
const read = (n) =>
  JSON.parse(
    fs
      .readFileSync(path.join(source, n + ".json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
const stable = (kind, value) => {
  const h = crypto
    .createHash("sha256")
    .update(`symportal-v2:${kind}:${value}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const raw = read("employees");
const allTasks = Object.entries(read("tasks")).flatMap(([date, rows]) =>
  rows.map((row) => ({ ...row, work_date: date })),
);
const byId = new Map(raw.map((e) => [String(e.id), e]));
const byCode = new Map(
  raw
    .filter((e) => String(e.emp_id ?? "").trim())
    .map((e) => [String(e.emp_id).trim(), e]),
);
const validTasks = [];
let unmatched = 0,
  missingId = 0;
for (const t of allTasks) {
  const orphan =
    !byId.has(String(t.userId)) && !byCode.has(String(t.userEmpId));
  const missing = t.id === undefined || t.id === null || t.id === "";
  if (orphan) unmatched++;
  if (missing) missingId++;
  if (!orphan && !missing) validTasks.push(t);
}
const emailCounts = new Map();
for (const e of raw) {
  const email = String(e.email ?? "")
    .trim()
    .toLowerCase();
  emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
}
const quarantine = [];
const employees = [];
const departments = new Map();
const skills = new Map();
const employeeSkills = [];
const pendingPrivate = [];
for (const e of raw) {
  const email = String(e.email ?? "")
    .trim()
    .toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    emailCounts.get(email) !== 1
  ) {
    quarantine.push({
      legacy_id: e.id,
      reason: "Missing, invalid, or duplicate work email",
    });
    continue;
  }
  const department = String(e.department ?? "").trim();
  if (department && !departments.has(department))
    departments.set(department, {
      id: stable("department", department),
      name: department,
    });
  const id = stable("employee", email);
  const code = String(e.emp_id ?? "").trim();
  employees.push({
    id,
    email,
    full_name: String(e.name || email.split("@")[0])
      .trim()
      .slice(0, 120),
    employee_code: code || null,
    title: String(e.designation ?? ""),
    department_id: department ? departments.get(department).id : null,
    location: String(e.location ?? ""),
    bio: String(e.bio ?? "").slice(0, 2000),
  });
  pendingPrivate.push({
    email,
    phone: String(e.phone ?? "").slice(0, 40),
    address: String(e.address ?? "").slice(0, 1000),
  });
  for (const name of Array.isArray(e.skills) ? e.skills : []) {
    if (typeof name !== "string" || !name.trim()) continue;
    const key = name.trim().toLowerCase();
    if (!skills.has(key))
      skills.set(key, { id: stable("skill", key), name: name.trim() });
    if (
      !employeeSkills.some(
        (s) => s.employee_id === id && s.skill_id === skills.get(key).id,
      )
    )
      employeeSkills.push({ employee_id: id, skill_id: skills.get(key).id });
  }
}
const projects = new Map();
for (const p of [...read("projects"), ...read("team_projects")]) {
  const name = String(p.title || p.name || "").trim();
  if (!name || name.toLowerCase() === "leave") continue;
  const key = name.toLowerCase();
  projects.set(key, {
    id: stable("project", key),
    name: name.slice(0, 120),
    description: String(p.description ?? "").slice(0, 4000),
    status: /complete|closed/i.test(p.status ?? "") ? "completed" : "active",
  });
}
// Calendar history is intentionally not imported for the new beginning. Valid records remain privately archived.
const holidays = read("holidays").flatMap((h) =>
  /^\d{4}-\d{2}-\d{2}$/.test(h.date)
    ? [{ id: stable("holiday", h.date), name: String(h.name), day: h.date }]
    : [],
);
const payload = {
  departments: [...departments.values()],
  employees,
  skills: [...skills.values()],
  employee_skills: employeeSkills,
  projects: [...projects.values()],
  holidays: [...new Map(holidays.map((h) => [h.day, h])).values()],
  pending_private: pendingPrivate,
};
fs.writeFileSync(
  path.join(output, "import.json"),
  JSON.stringify(payload, null, 2),
);
fs.writeFileSync(
  path.join(output, "valid-calendar-archive.json"),
  JSON.stringify(validTasks, null, 2),
);
fs.writeFileSync(
  path.join(output, "quarantine.json"),
  JSON.stringify(quarantine, null, 2),
);
const report = {
  sourceEmployees: raw.length,
  readyEmployees: employees.length,
  quarantinedEmployees: quarantine.length,
  sourceCalendarEntries: allTasks.length,
  unmatchedEntriesRemoved: unmatched,
  missingIdEntriesRemoved: missingId,
  removedUnion: allTasks.length - validTasks.length,
  validEntriesPrivatelyArchived: validTasks.length,
  calendarEntriesToImport: 0,
  publicEmployeeFiles: 0,
  authoritativeDataset: "private-backup/legacy-data/employees.json",
  nestedPublicDataset: "excluded; not merged",
  backupPreserved: true,
};
fs.writeFileSync(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
