import { useCallback, useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Smile,
  SpellCheck,
  Paperclip,
  Save,
} from "lucide-react";
import { Modal, useToast } from "../../components/ui";
import { client } from "../../lib/supabase";
import {
  cleanNote,
  type Note,
  type Folder,
  type NoteFile,
} from "../../lib/notes";
import { errorMessage } from "../../lib/domain";
export default function NoteEditor({
  note,
  folder,
  folders,
  attachments,
  preview,
  onClose,
  onSaved,
  onAttach,
}: {
  note: Note | null;
  folder: string | null;
  folders: Folder[];
  attachments: NoteFile[];
  preview: boolean;
  onClose: () => void;
  onSaved: (n: Note) => void;
  onAttach: (n: Note) => void;
}) {
  const editor = useRef<HTMLDivElement>(null),
    range = useRef<Range | null>(null);
  const [title, setTitle] = useState(note?.title || ""),
    [folderId, setFolderId] = useState(note?.folder_id || folder || ""),
    [busy, setBusy] = useState(false),
    [spell, setSpell] = useState(true),
    [emojis, setEmojis] = useState(false),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const toast = useToast();
  const history = useRef<{ values: string[]; index: number }>({
    values: [],
    index: 0,
  });
  const mountEditor = useCallback(
    (node: HTMLDivElement | null) => {
      editor.current = node;
      if (node) {
        node.innerHTML = cleanNote(note?.content || "<p><br></p>");
        history.current = { values: [node.innerHTML], index: 0 };
        range.current = null;
      }
    },
    [note?.id],
  );
  function checkpoint() {
    if (!editor.current) return;
    const h = history.current,
      value = editor.current.innerHTML;
    if (h.values[h.index] !== value) {
      h.values = h.values.slice(0, h.index + 1);
      h.values.push(value);
      if (h.values.length > 150) h.values.shift();
      h.index = h.values.length - 1;
    }
    setDirty(true);
    remember();
  }
  function restore(direction: number) {
    if (!editor.current) return;
    const h = history.current;
    h.index = Math.max(0, Math.min(h.values.length - 1, h.index + direction));
    editor.current.innerHTML = h.values[h.index] || "";
    const r = document.createRange();
    r.selectNodeContents(editor.current);
    r.collapse(false);
    range.current = r;
    editor.current.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(r);
    setDirty(true);
  }
  function remember() {
    const s = window.getSelection();
    if (s?.rangeCount && editor.current?.contains(s.anchorNode))
      range.current = s.getRangeAt(0).cloneRange();
  }
  function command(name: string, value?: string) {
    if (name === "undo" || name === "redo") {
      restore(name === "undo" ? -1 : 1);
      return;
    }
    editor.current?.focus();
    const s = window.getSelection();
    if (range.current && s) {
      s.removeAllRanges();
      s.addRange(range.current);
    }
    document.execCommand(name, false, value);
    checkpoint();
  }
  async function save(attach = false) {
    if (!title.trim()) {
      toast("Add a note title.", "error");
      return;
    }
    setBusy(true);
    try {
      const content = cleanNote(editor.current?.innerHTML || "");
      if (content.length > 200000)
        throw Error("This note is too long. Split it into smaller notes.");
      let saved: Note;
      if (preview)
        saved = {
          id: note?.id || crypto.randomUUID(),
          title: title.trim(),
          content,
          folder_id: folderId || null,
          created_at: note?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      else {
        const values = {
          title: title.trim(),
          content,
          folder_id: folderId || null,
        };
        const r = note
          ? await client()
              .from("workspace_notes")
              .update(values)
              .eq("id", note.id)
              .select()
              .single()
          : await client()
              .from("workspace_notes")
              .insert(values)
              .select()
              .single();
        if (r.error) throw r.error;
        saved = r.data;
      }
      setDirty(false);
      onSaved(saved);
      if (attach) onAttach(saved);
      else onClose();
      toast(
        preview ? "Preview note saved for this page session." : "Note saved.",
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        open
        onClose={() => {
          if (busy) return;
          dirty ? setDiscard(true) : onClose();
        }}
        title={note ? "Edit note" : "Add a note"}
        description="A private space for your ideas, plans and attachments."
        wide
      >
        <div className="note-editor-fields">
          <input
            aria-label="Note title"
            className="note-title"
            placeholder="Untitled note"
            maxLength={160}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
          <label>
            Folder
            <select
              value={folderId}
              onChange={(e) => {
                setFolderId(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="note-toolbar"
          role="toolbar"
          aria-label="Note formatting"
        >
          {[
            [Undo2, "Undo", "undo"],
            [Redo2, "Redo", "redo"],
            [Bold, "Bold", "bold"],
            [Italic, "Italic", "italic"],
            [Heading1, "Heading 1", "formatBlock", "h1"],
            [Heading2, "Heading 2", "formatBlock", "h2"],
          ].map(([Icon, label, cmd, value]: any) => (
            <button
              type="button"
              className="icon-button"
              key={label}
              aria-label={label}
              title={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(cmd, value)}
            >
              <Icon size={18} />
            </button>
          ))}
          <button
            className="icon-button"
            title="Emojis"
            aria-label="Emojis"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEmojis(!emojis)}
          >
            <Smile size={18} />
          </button>
          <button
            className="icon-button"
            title="Browser spell check"
            aria-label="Spell check"
            aria-pressed={spell}
            onClick={() => setSpell(!spell)}
          >
            <SpellCheck size={18} />
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void save(true)}
          >
            <Paperclip size={16} />
            Attach files
          </button>
        </div>
        {emojis && (
          <div className="emoji-picker" aria-label="Choose emoji">
            {[
              "😀",
              "😊",
              "🎉",
              "👍",
              "❤️",
              "✅",
              "💡",
              "📌",
              "🚀",
              "👋",
              "🤔",
              "🙏",
            ].map((e) => (
              <button
                key={e}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  command("insertText", e);
                  setEmojis(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div
          ref={mountEditor}
          className="rich-note"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Note content"
          aria-multiline
          spellCheck={spell}
          onInput={checkpoint}
          onKeyDown={(e) => {
            if (
              (e.ctrlKey || e.metaKey) &&
              ["z", "y"].includes(e.key.toLowerCase())
            ) {
              e.preventDefault();
              restore(e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
            }
          }}
          onKeyUp={remember}
          onMouseUp={remember}
          onPaste={(e) => {
            e.preventDefault();
            command("insertText", e.clipboardData.getData("text/plain"));
          }}
          onDrop={(e) => e.preventDefault()}
        />
        <p className="muted">
          {spell
            ? "Browser spell checking is on; right-click an underlined word for suggestions."
            : "Spell checking is off."}
        </p>
        {!!attachments.length && (
          <p className="muted">
            <Paperclip size={14} /> {attachments.map((a) => a.name).join(" · ")}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => (dirty ? setDiscard(true) : onClose())}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button"
            onClick={() => void save()}
            disabled={busy}
          >
            <Save size={16} />
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </Modal>
      <Modal
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard unsaved changes?"
      >
        <p>Your last saved note will be kept.</p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDiscard(false)}
          >
            Keep editing
          </button>
          <button className="button danger" onClick={onClose}>
            Discard changes
          </button>
        </div>
      </Modal>
    </>
  );
}
