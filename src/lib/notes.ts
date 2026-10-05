import { uploadWithProgress } from "./uploadTransport";
import { client } from "./supabase";
import { rpc } from "./api";
export type Note = {
  owner_id?: string;
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};
export type Folder = { id: string; name: string };
export type NoteFile = {
  owner_id?: string;
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  object_path: string;
  folder_id: string | null;
  note_id: string | null;
  created_at: string;
  legacy?: boolean;
};
export const fileTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};
export const attachmentAccept = Object.keys(fileTypes)
  .map((e) => "." + e)
  .join(",");
export const fileSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(0, Math.round(bytes / 1024))} KB`;
// Parse into a detached document; reconstruct only formatting tags, never attributes or active content.
export function cleanNote(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "H1",
    "H2",
    "P",
    "DIV",
    "BR",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
  ]);
  function copy(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE)
      return document.createTextNode(node.textContent || "");
    if (!(node instanceof Element)) return null;
    if (
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "OBJECT",
        "SVG",
        "MATH",
        "TEMPLATE",
      ].includes(node.tagName)
    )
      return null;
    const result = allowed.has(node.tagName)
      ? document.createElement(node.tagName.toLowerCase())
      : document.createDocumentFragment();
    node.childNodes.forEach((child) => {
      const c = copy(child);
      if (c) result.appendChild(c);
    });
    return result;
  }
  const output = document.createElement("div");
  parsed.body.childNodes.forEach((n) => {
    const c = copy(n);
    if (c) output.appendChild(c);
  });
  return output.innerHTML;
}
export async function uploadNoteFile(
  file: File,
  folder: string | null,
  note: string | null,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = fileTypes[extension];
  if (
    !mime ||
    (file.type &&
      file.type !== mime &&
      file.type !== "application/octet-stream" &&
      !(extension === "csv" && file.type === "application/vnd.ms-excel") &&
      !(extension === "zip" && file.type === "application/x-zip-compressed"))
  )
    throw Error("Choose a supported image, document, PDF, text or ZIP file.");
  if (file.size === 0 || file.size > 20 * 1024 * 1024)
    throw Error("Choose a file between 1 byte and 20 MB.");
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  if (!data.session) throw Error("Please sign in again.");
  const path = `${data.session.user.id}/${crypto.randomUUID()}.${extension}`;
  const cleanup = async () => {
    await client().storage.from("workspace-files").remove([path]);
  };
  try {
    await uploadWithProgress(
      file,
      `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/workspace-files/${path}`,
      data.session.access_token,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      mime,
      onProgress,
      signal,
    );
    if (signal.aborted) throw Error("Upload cancelled.");
    await rpc("register_workspace_file", {
      p_name: file.name,
      p_path: path,
      p_mime: mime,
      p_size: file.size,
      p_folder: folder,
      p_note: note,
    });
    onProgress(100);
  } catch (error) {
    await cleanup();
    throw error;
  }
}
