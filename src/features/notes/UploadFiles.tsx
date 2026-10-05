import { useRef, useState, useEffect } from "react";
import { Upload, FileText, X, Plus, CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/ui";
import { uploadNoteFile, attachmentAccept, fileSize } from "../../lib/notes";
import { errorMessage } from "../../lib/domain";
type Item = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};
export default function UploadFiles({
  folder,
  note,
  preview,
  onClose,
  onUploaded,
}: {
  folder: string | null;
  note: string | null;
  preview: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false);
  const live = useRef(true);
  const input = useRef<HTMLInputElement>(null),
    active = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      active.current?.abort();
    };
  }, []);
  function add(files: FileList | null) {
    if (!files) return;
    setItems((prev) => [
      ...prev,
      ...Array.from(files)
        .slice(0, 20)
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          progress: 0,
          status: "queued" as const,
        })),
    ]);
  }
  function update(id: string, value: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...value } : i)));
  }
  async function upload() {
    if (preview) return;
    setBusy(true);
    for (const item of items.filter(
      (i) => i.status === "queued" || i.status === "error",
    )) {
      if (!live.current) break;
      const controller = new AbortController();
      active.current = controller;
      update(item.id, { status: "uploading", progress: 0, error: undefined });
      try {
        await uploadNoteFile(
          item.file,
          folder,
          note,
          (p) => update(item.id, { progress: p }),
          controller.signal,
        );
        update(item.id, { status: "done", progress: 100 });
        onUploaded();
      } catch (e) {
        update(item.id, { status: "error", error: errorMessage(e) });
      }
    }
    active.current = null;
    setBusy(false);
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Upload files"
      description="Images, PDF, Word, Excel, PowerPoint, text and ZIP · up to 20 MB per file."
    >
      <div
        className={`upload-dropzone ${drag ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) add(e.dataTransfer.files);
        }}
      >
        <Upload size={28} />
        <p>
          Drag files here or{" "}
          <button
            className="text-button"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            browse files
          </button>
        </p>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept={attachmentAccept}
        multiple
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="upload-queue">
        {items.map((item) => (
          <div className="upload-item" key={item.id}>
            <FileText size={26} />
            <div>
              <strong>{item.file.name}</strong>
              <small>
                {item.status === "uploading"
                  ? `Uploading… ${item.progress}%`
                  : item.status === "done"
                    ? "Uploaded"
                    : fileSize(item.file.size)}
              </small>
              {item.status === "uploading" && (
                <progress
                  max={100}
                  value={item.progress}
                  aria-label={`Upload progress for ${item.file.name}`}
                />
              )}{" "}
              {item.error && (
                <small role="alert" className="error-text">
                  {item.error}
                </small>
              )}
            </div>
            {item.status === "done" ? (
              <CheckCircle2 size={20} />
            ) : (
              <button
                className="icon-button"
                aria-label={
                  item.status === "uploading"
                    ? `Cancel ${item.file.name}`
                    : `Remove ${item.file.name}`
                }
                disabled={busy && item.status !== "uploading"}
                onClick={() =>
                  item.status === "uploading"
                    ? active.current?.abort()
                    : setItems((prev) => prev.filter((i) => i.id !== item.id))
                }
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {preview && (
        <p className="muted">
          Preview: file selection is available; uploads need a signed-in
          workspace.
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Done
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus size={16} />
          Add files
        </button>
        <button
          className="button"
          disabled={
            preview ||
            busy ||
            !items.some((i) => i.status === "queued" || i.status === "error")
          }
          onClick={() => void upload()}
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </Modal>
  );
}
