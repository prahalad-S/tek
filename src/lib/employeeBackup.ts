import JSZip from "jszip";
import { csvCell } from "./domain.ts";
export type BackupSnapshot = {
  schema_version: number;
  exported_at: string;
  employee: { id: string; full_name: string; avatar_path?: string | null };
  entries?: Record<string, unknown>[];
  profile_documents?: { id: string; name: string; object_path: string }[];
  [key: string]: unknown;
};
const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
export async function createEmployeeArchive(
  snapshot: BackupSnapshot,
  load: (bucket: string, path: string) => Promise<ArrayBuffer>,
  progress: (message: string) => void,
) {
  const zip = new JSZip();
  zip.file("employee-backup.json", JSON.stringify(snapshot, null, 2));
  const rows = snapshot.entries || [];
  const columns = [
    "id",
    "timesheet_id",
    "work_date",
    "project_id",
    "description",
    "minutes",
    "version",
  ];
  zip.file(
    "timesheet-entries.csv",
    [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((k) => csvCell(String(row[k] ?? ""))).join(","),
      ),
    ].join("\r\n"),
  );
  zip.file(
    "README.txt",
    `Tekzenit employee backup\nEmployee: ${snapshot.employee.full_name}\nSnapshot: ${snapshot.exported_at}\n\nAll operational records are in employee-backup.json; entries are also included as CSV.\nProfile files and avatar are included when present.\nPersonal notes, their attachments, authentication credentials and other employees' records are excluded.\nThis is a point-in-time export. Removing access retains the server-side work history.\nStore this archive securely; it contains personal employee information.\n`,
  );
  const docs = snapshot.profile_documents || [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    progress(`Backing up file ${i + 1} of ${docs.length}…`);
    zip.file(
      `profile-files/${safeName(d.id)}-${safeName(d.name)}`,
      await load("employee-documents", d.object_path),
    );
  }
  if (snapshot.employee.avatar_path) {
    progress("Backing up profile photo…");
    zip.file(
      "profile-photo/" +
        safeName(snapshot.employee.avatar_path.split("/").pop() || "photo"),
      await load("avatars", snapshot.employee.avatar_path),
    );
  }
  progress("Preparing archive…");
  return zip.generateAsync(
    { type: "uint8array", compression: "DEFLATE" },
    (meta) => progress(`Preparing archive… ${Math.round(meta.percent)}%`),
  );
}
export function employeeBackupName(snapshot: BackupSnapshot) {
  return `Tekzenit-${safeName(snapshot.employee.full_name)}-${snapshot.exported_at.slice(0, 10)}.zip`;
}
