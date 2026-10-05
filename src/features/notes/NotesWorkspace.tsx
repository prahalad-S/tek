import { useSearchParams } from "react-router-dom";
import NoteActions from "./NoteActions";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FolderPlus,
  Plus,
  Upload,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  X,
  Download,
  Trash2,
  Pencil,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { documents, removeDocument, signedUrl } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import {
  cleanNote,
  fileSize,
  type Note,
  type Folder as FolderRecord,
  type NoteFile,
} from "../../lib/notes";
import {
  PageHeader,
  Modal,
  Loading,
  ErrorState,
  EmptyState,
  useToast,
} from "../../components/ui";
import NoteEditor from "./NoteEditor";
import UploadFiles from "./UploadFiles";
type Selected =
  { kind: "note"; value: Note } | { kind: "file"; value: NoteFile };
export default function NotesWorkspace() {
  const { preview, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const owns = (value: Note | NoteFile) =>
    preview ||
    value.owner_id === profile?.user_id ||
    ("legacy" in value && value.legacy);
  const qc = useQueryClient(),
    toast = useToast();
  const [demo, setDemo] = useState<{ notes: Note[]; folders: FolderRecord[] }>({
    notes: [],
    folders: [],
  });
  const [folder, setFolder] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [view, setView] = useState("grid"),
    [selected, setSelected] = useState<Selected | null>(null),
    [editing, setEditing] = useState<{ note: Note | null } | null>(null),
    [upload, setUpload] = useState<{
      note: string | null;
      folder: string | null;
    } | null>(null),
    [newFolder, setNewFolder] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["notes-workspace", profile?.user_id, preview],
    refetchInterval: 30000,
    queryFn: async () => {
      if (preview)
        return {
          notes: [] as Note[],
          folders: [] as FolderRecord[],
          files: [] as NoteFile[],
        };
      const [notes, folders, files, legacy] = await Promise.all([
        client()
          .from("workspace_notes")
          .select("*")
          .order("updated_at", { ascending: false }),
        client().from("workspace_folders").select("*").order("name"),
        client()
          .from("workspace_files")
          .select("*")
          .order("created_at", { ascending: false }),
        documents(profile!.user_id!),
      ]);
      for (const r of [notes, folders, files]) if (r.error) throw r.error;
      return {
        notes: notes.data as Note[],
        folders: folders.data as FolderRecord[],
        files: [
          ...(files.data as NoteFile[]),
          ...legacy.map((f) => ({
            ...f,
            folder_id: null,
            note_id: null,
            legacy: true,
          })),
        ],
      };
    },
  });
  const notes = preview ? demo.notes : q.data?.notes || [],
    folders = preview ? demo.folders : q.data?.folders || [],
    files = q.data?.files || [];
  useEffect(() => {
    if (preview || !q.data) return;
    const requested = params.get("note");
    if (requested) {
      const n = q.data.notes.find((n) => n.id === requested);
      setSelected(n ? { kind: "note", value: n } : null);
    } else if (selected) {
      const value =
        selected.kind === "note"
          ? q.data.notes.find((n) => n.id === selected.value.id)
          : q.data.files.find((n) => n.id === selected.value.id);
      setSelected(value ? ({ kind: selected.kind, value } as Selected) : null);
    }
  }, [q.data, params, preview]);
  const items = useMemo(
    () =>
      [
        ...notes.map((value) => ({ kind: "note" as const, value })),
        ...files.map((value) => ({ kind: "file" as const, value })),
      ]
        .filter(
          (i) =>
            (!folder || i.value.folder_id === folder) &&
            ("title" in i.value ? i.value.title : i.value.name)
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => b.value.created_at.localeCompare(a.value.created_at)),
    [notes, files, folder, search],
  );
  const total = files.reduce((sum, f) => sum + f.size_bytes, 0),
    media = files
      .filter((f) => f.mime_type.startsWith("image/"))
      .reduce((sum, f) => sum + f.size_bytes, 0),
    documentBytes = files
      .filter(
        (f) =>
          !f.mime_type.startsWith("image/") &&
          f.mime_type !== "application/zip",
      )
      .reduce((sum, f) => sum + f.size_bytes, 0);
  const mediaAngle = total ? (media / total) * 360 : 0,
    documentAngle = total ? ((media + documentBytes) / total) * 360 : 0;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["notes-workspace"] });
    void qc.invalidateQueries({ queryKey: ["documents"] });
  };
  async function download(f: NoteFile) {
    try {
      const url = await signedUrl(
        f.legacy ? "employee-documents" : "workspace-files",
        f.object_path,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function remove() {
    if (!selected || !owns(selected.value)) return;
    setBusy(true);
    try {
      if (selected.kind === "note") {
        if (preview)
          setDemo((d) => ({
            ...d,
            notes: d.notes.filter((n) => n.id !== selected.value.id),
          }));
        else {
          const r = await client()
            .from("workspace_notes")
            .delete()
            .eq("id", selected.value.id);
          if (r.error) throw r.error;
        }
      } else {
        if (selected.value.legacy) await removeDocument(selected.value as any);
        else {
          const storage = await client()
            .storage.from("workspace-files")
            .remove([selected.value.object_path]);
          if (storage.error) throw storage.error;
          const r = await client()
            .from("workspace_files")
            .delete()
            .eq("id", selected.value.id);
          if (r.error) throw r.error;
        }
      }
      setDeleting(false);
      setSelected(null);
      refresh();
      toast("Removed.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  function choose(item: Selected | null) {
    if (params.has("note")) {
      setParams({}, { replace: true });
    }
    setSelected(item);
  }
  const name = (item: Selected) =>
    item.kind === "note" ? item.value.title : item.value.name;
  return (
    <>
      <PageHeader
        eyebrow="YOUR PERSONAL WORKSPACE"
        title="Notes & documents"
        description="Keep your ideas and files together, beautifully organized."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => setNewFolder(true)}
            >
              <FolderPlus size={16} />
              New folder
            </button>
            <button
              className="button secondary"
              onClick={() => setUpload({ note: null, folder })}
            >
              <Upload size={16} />
              Upload files
            </button>
            <button
              className="button"
              onClick={() => setEditing({ note: null })}
            >
              <Plus size={16} />
              Add note
            </button>
          </>
        }
      />
      {params.get("note") &&
        q.isSuccess &&
        !preview &&
        !notes.some((n) => n.id === params.get("note")) && (
          <p role="status" className="info-strip">
            This shared note was removed or you no longer have access.
          </p>
        )}
      <div className="notes-workspace">
        <div className="notes-main">
          <section className="notes-folder-section">
            <div className="panel-heading">
              <h2>Folders</h2>
              <button
                className="text-button"
                onClick={() => {
                  setFolder(null);
                  setSearch("");
                }}
              >
                View all
              </button>
            </div>
            <div className="notes-folders">
              <button
                className={`folder-tile ${!folder ? "selected" : ""}`}
                onClick={() => setFolder(null)}
              >
                <Folder size={30} />
                <strong>All items</strong>
                <small>{notes.length + files.length} items</small>
              </button>
              {folders.map((f) => (
                <button
                  className={`folder-tile ${folder === f.id ? "selected" : ""}`}
                  key={f.id}
                  onClick={() => {
                    setFolder(f.id);
                    setSelected(null);
                  }}
                >
                  <Folder size={30} />
                  <strong>{f.name}</strong>
                  <small>
                    {notes.filter((n) => n.folder_id === f.id).length +
                      files.filter((n) => n.folder_id === f.id).length}{" "}
                    items
                  </small>
                </button>
              ))}
              <button
                className="folder-tile folder-tile--new"
                onClick={() => setNewFolder(true)}
              >
                <FolderPlus size={28} />
                <strong>Create folder</strong>
              </button>
            </div>
          </section>
          <section className="notes-content">
            <div className="notes-list-heading">
              <h2>
                {folder
                  ? folders.find((f) => f.id === folder)?.name
                  : "Recently added"}
              </h2>
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search notes and files"
                  placeholder="Search notes and files…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="view-toggle">
                <button
                  aria-label="Document card view"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  aria-label="Document list view"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List size={17} />
                </button>
              </div>
            </div>
            {q.isPending ? (
              <Loading />
            ) : q.error ? (
              <ErrorState error={q.error} retry={() => void q.refetch()} />
            ) : !items.length ? (
              <EmptyState
                title="A place for your next idea"
                description="Add a note or upload a file to get started."
              />
            ) : view === "grid" ? (
              <div className="notes-grid">
                {items.map((item) => (
                  <button
                    className={`note-tile ${selected?.value.id === item.value.id ? "selected" : ""}`}
                    key={item.value.id}
                    onClick={() => choose(item)}
                  >
                    <span
                      className={`file-symbol ${item.kind === "note" ? "is-note" : ""}`}
                    >
                      {item.kind === "file" &&
                      item.value.mime_type.startsWith("image/") ? (
                        <ImageIcon size={24} />
                      ) : (
                        <FileText size={24} />
                      )}
                    </span>
                    <strong>{name(item)}</strong>
                    <small>
                      {item.kind === "note"
                        ? "Note"
                        : fileSize(item.value.size_bytes)}{" "}
                      · {new Date(item.value.created_at).toLocaleDateString()}
                    </small>
                    {item.kind === "note" && (
                      <p>
                        {new DOMParser()
                          .parseFromString(
                            cleanNote(item.value.content),
                            "text/html",
                          )
                          .body.textContent?.slice(0, 110) || "No content yet"}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date added</th>
                      <th>Details</th>
                      <th>File size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.value.id}
                        className={
                          selected?.value.id === item.value.id ? "selected" : ""
                        }
                        onClick={() => choose(item)}
                      >
                        <td>
                          <button
                            className="file-name-button"
                            onClick={() => choose(item)}
                          >
                            <FileText size={18} />
                            {name(item)}
                          </button>
                        </td>
                        <td>
                          {new Date(item.value.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          {item.kind === "note"
                            ? "Note"
                            : item.value.mime_type.startsWith("image/")
                              ? "Image"
                              : "Document"}
                        </td>
                        <td>
                          {item.kind === "file"
                            ? fileSize(item.value.size_bytes)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <aside
          className="notes-details panel"
          aria-label="Storage and item details"
        >
          <div className="panel-heading">
            <h2>{selected ? "Item details" : "Storage details"}</h2>
            {selected && (
              <button
                className="icon-button"
                aria-label="Close file details"
                onClick={() => choose(null)}
              >
                <X size={16} />
              </button>
            )}
          </div>
          {selected && (
            <div className="selected-file-details">
              <div className="item-identity">
                <span className="file-symbol">
                  <FileText size={24} />
                </span>
                <h3>{name(selected)}</h3>
                <div className="item-icon-actions">
                  {selected.kind === "note" && owns(selected.value) && (
                    <button
                      className="icon-button"
                      aria-label="Edit note"
                      title="Edit note"
                      onClick={() =>
                        setEditing({ note: selected.value as Note })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {owns(selected.value) && (
                    <button
                      className="icon-button"
                      aria-label="Delete selected item"
                      title="Delete item"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <dl>
                <dt>Type</dt>
                <dd>
                  {selected.kind === "note"
                    ? owns(selected.value)
                      ? "Your note"
                      : "Shared note"
                    : selected.value.mime_type}
                </dd>
                <dt>Added</dt>
                <dd>
                  {new Date(selected.value.created_at).toLocaleDateString()}
                </dd>
                <dt>Folder</dt>
                <dd>
                  {folders.find((f) => f.id === selected.value.folder_id)
                    ?.name || "No folder"}
                </dd>
                {selected.kind === "file" && (
                  <>
                    <dt>Size</dt>
                    <dd>{fileSize(selected.value.size_bytes)}</dd>
                  </>
                )}
              </dl>
              {selected.kind === "file" && (
                <button
                  className="button secondary"
                  onClick={() => void download(selected.value as NoteFile)}
                >
                  <Download size={15} />
                  Open / download
                </button>
              )}
              {selected.kind === "note" && (
                <>
                  <NoteActions key={selected.value.id} note={selected.value} />
                  <div
                    className="note-preview"
                    dangerouslySetInnerHTML={{
                      __html: cleanNote(selected.value.content),
                    }}
                  />
                  {files
                    .filter((f) => f.note_id === selected.value.id)
                    .map((f) => (
                      <button
                        className="attachment-link"
                        key={f.id}
                        onClick={() => choose({ kind: "file", value: f })}
                      >
                        <Paperclip size={14} />
                        {f.name}
                      </button>
                    ))}
                </>
              )}
            </div>
          )}
          {!selected && (
            <>
              <div
                className="storage-donut"
                role="img"
                aria-label={`${fileSize(total)} in ${files.length} accessible files`}
                style={{
                  background: `conic-gradient(#45b6cf 0deg ${mediaAngle}deg,#7961df ${mediaAngle}deg ${documentAngle}deg,#f4be60 ${documentAngle}deg ${total ? 360 : 0}deg,var(--border) ${total ? 360 : 0}deg 360deg)`,
                }}
              >
                <div>
                  <strong>{fileSize(total)}</strong>
                  <small>{files.length} accessible files</small>
                </div>
              </div>
              {[
                ["Documents", documentBytes, FileText],
                ["Images", media, ImageIcon],
                ["Other files", total - media - documentBytes, Folder],
              ].map(([label, bytes, Icon]: any) => (
                <div className="storage-category" key={label}>
                  <Icon size={20} />
                  <span>{label}</span>
                  <strong>{fileSize(bytes)}</strong>
                </div>
              ))}
              <p className="muted storage-caption">
                <ShieldCheck size={14} />
                Files are private unless their note is shared with you. This
                shows accessible file usage.
              </p>
            </>
          )}
        </aside>
      </div>
      <Modal
        open={newFolder}
        onClose={() => setNewFolder(false)}
        title="New folder"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(
              new FormData(e.currentTarget).get("name") || "",
            ).trim();
            if (!name) return;
            setBusy(true);
            try {
              if (preview)
                setDemo((d) => ({
                  ...d,
                  folders: [...d.folders, { id: crypto.randomUUID(), name }],
                }));
              else {
                const r = await client()
                  .from("workspace_folders")
                  .insert({ name });
                if (r.error) throw r.error;
              }
              refresh();
              setNewFolder(false);
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Folder name
            <input
              name="name"
              required
              maxLength={100}
              placeholder="e.g. Project ideas"
            />
          </label>
          <div className="form-actions">
            <button className="button" disabled={busy}>
              Create folder
            </button>
          </div>
        </form>
      </Modal>
      {editing && (
        <NoteEditor
          key={editing.note?.id || "new"}
          note={editing.note}
          folder={folder}
          folders={folders}
          attachments={files.filter((f) => f.note_id === editing.note?.id)}
          preview={preview}
          onClose={() => setEditing(null)}
          onSaved={(n) => {
            if (preview)
              setDemo((d) => ({
                ...d,
                notes: [n, ...d.notes.filter((x) => x.id !== n.id)],
              }));
            refresh();
            setSelected({ kind: "note", value: n });
            setEditing({ note: n });
          }}
          onAttach={(n) => {
            setEditing(null);
            setUpload({ note: n.id, folder: n.folder_id });
          }}
        />
      )}
      {upload && (
        <UploadFiles
          folder={upload.folder}
          note={upload.note}
          preview={preview}
          onClose={() => setUpload(null)}
          onUploaded={refresh}
        />
      )}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this item?"
      >
        <p>{selected ? name(selected) : ""}</p>
        {selected?.kind === "note" && (
          <p>Attached files remain in your documents.</p>
        )}
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setDeleting(false)}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete
          </button>
        </div>
      </Modal>
    </>
  );
}
