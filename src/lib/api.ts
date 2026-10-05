import { client } from "./supabase";
import type {
  Employee,
  Project,
  Entry,
  Timesheet,
  Notice,
  DocumentRecord,
} from "./types";
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function employees(search = "", department = "", page = 0) {
  let q = client()
    .from("employees")
    .select("*, departments(name)", { count: "exact" })
    .order("full_name")
    .range(page * 24, page * 24 + 23);
  if (search)
    q = q.ilike(
      "full_name",
      `%${search.replaceAll("%", "").replaceAll("_", "")}%`,
    );
  if (department) q = q.eq("department_id", department);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data as Employee[], count: count ?? 0 };
}
export async function projects(): Promise<Project[]> {
  const { data, error } = await client()
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function sheet(week: string) {
  return rpc<Timesheet>("get_or_create_timesheet", { p_week: week });
}
export async function entries(sheetId: string): Promise<Entry[]> {
  const { data, error } = await client()
    .from("time_entries")
    .select("*, projects(name)")
    .eq("timesheet_id", sheetId)
    .order("work_date");
  if (error) throw error;
  return data;
}
export async function notices(): Promise<Notice[]> {
  const { data, error } = await client()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
export async function documents(userId: string): Promise<DocumentRecord[]> {
  const { data, error } = await client()
    .from("employee_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function upload(
  file: File,
  userId: string,
  kind: "avatar" | "document",
) {
  const max = kind === "avatar" ? 2 : 10;
  if (file.size > max * 1024 * 1024)
    throw new Error(`Choose a file smaller than ${max} MB.`);
  const allowed =
    kind === "avatar"
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type))
    throw new Error(
      "Use a JPG, PNG, WebP" +
        (kind === "document" ? " or PDF" : "") +
        " file.",
    );
  const path = `${userId}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const bucket = kind === "avatar" ? "avatars" : "employee-documents";
  const { error } = await client()
    .storage.from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  try {
    if (kind === "avatar") await rpc("set_my_avatar", { p_path: path });
    else
      await rpc("register_document", {
        p_name: file.name,
        p_path: path,
        p_mime: file.type,
        p_size: file.size,
      });
  } catch (e) {
    await client().storage.from(bucket).remove([path]);
    throw e;
  }
  return path;
}
export async function signedUrl(bucket: string, path: string) {
  const { data, error } = await client()
    .storage.from(bucket)
    .createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}
export async function removeDocument(doc: DocumentRecord) {
  const { error } = await client()
    .storage.from("employee-documents")
    .remove([doc.object_path]);
  if (error) throw error;
  await rpc("delete_document_record", { p_id: doc.id });
}
