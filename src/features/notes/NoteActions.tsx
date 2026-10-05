import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, Heart, Search } from "lucide-react";
import { Modal, Loading, ErrorState, useToast } from "../../components/ui";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc } from "../../lib/api";
import { directoryPeople } from "../../lib/profiles";
import { previewEmployees } from "../../lib/preview";
import { errorMessage } from "../../lib/domain";
import type { Note } from "../../lib/notes";
export default function NoteActions({ note }: { note: Note }) {
  const { profile, preview } = useAuth(),
    qc = useQueryClient(),
    toast = useToast();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [demoLiked, setDemoLiked] = useState(false);
  const owner = preview || note.owner_id === profile?.user_id;
  const likes = useQuery({
    queryKey: ["note-likes", note.id, preview],
    queryFn: async () => {
      if (preview) return [];
      const r = await client()
        .from("workspace_note_likes")
        .select("user_id")
        .eq("note_id", note.id);
      if (r.error) throw r.error;
      return r.data;
    },
    refetchInterval: 30000,
  });
  const liked = preview
      ? demoLiked
      : !!likes.data?.some((l) => l.user_id === profile?.user_id),
    count = preview ? Number(demoLiked) : likes.data?.length || 0;
  return (
    <>
      <div className="note-social-actions">
        <button
          className="button secondary"
          aria-label={liked ? "Unlike note" : "Like note"}
          aria-pressed={liked}
          disabled={busy || !!likes.error || likes.isPending}
          onClick={async () => {
            if (preview) {
              setDemoLiked(!demoLiked);
              return;
            }
            setBusy(true);
            try {
              const r = liked
                ? await client()
                    .from("workspace_note_likes")
                    .delete()
                    .eq("note_id", note.id)
                    .eq("user_id", profile!.user_id!)
                : await client()
                    .from("workspace_note_likes")
                    .insert({ note_id: note.id });
              if (r.error) throw r.error;
              await qc.invalidateQueries({ queryKey: ["note-likes", note.id] });
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Heart size={16} fill={liked ? "currentColor" : "none"} />
          {count} {count === 1 ? "like" : "likes"}
        </button>
        {owner && (
          <button className="button secondary" onClick={() => setOpen(true)}>
            <Share2 size={16} />
            Share note
          </button>
        )}
      </div>
      {likes.error && (
        <p className="muted">Likes need the latest workspace update.</p>
      )}
      {open && <ShareNote note={note} onClose={() => setOpen(false)} />}
    </>
  );
}
function ShareNote({ note, onClose }: { note: Note; onClose: () => void }) {
  const { preview, profile } = useAuth();
  const q = useQuery({
    queryKey: ["note-sharing", note.id, preview],
    queryFn: async () => {
      if (preview)
        return { people: previewEmployees, selected: [] as string[] };
      const [people, shares] = await Promise.all([
        directoryPeople(),
        client()
          .from("workspace_note_shares")
          .select("user_id")
          .eq("note_id", note.id),
      ]);
      if (shares.error) throw shares.error;
      return {
        people: people.filter(
          (p) => p.user_id && p.user_id !== profile?.user_id,
        ),
        selected: shares.data.map((s) => s.user_id),
      };
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Share note"
      description="Choose employees who can read this note and its attachments. New recipients receive a notification. Uncheck someone to remove their access."
    >
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <ShareForm
          key={q.dataUpdatedAt}
          note={note}
          initial={q.data.selected}
          people={q.data.people}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
function ShareForm({
  note,
  initial,
  people,
  onClose,
}: {
  note: Note;
  initial: string[];
  people: Awaited<ReturnType<typeof directoryPeople>>;
  onClose: () => void;
}) {
  const { preview, profile } = useAuth(),
    toast = useToast(),
    qc = useQueryClient();
  const [selected, setSelected] = useState(initial),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label="Search sharing recipients"
          placeholder="Search employee or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="note-share-people">
        {people
          .filter(
            (p) =>
              p.user_id !== profile?.user_id &&
              (p.full_name + " " + p.location)
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .map((p) => {
            const id = p.user_id || p.id;
            return (
              <label key={id} className="share-person">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, id]
                        : prev.filter((x) => x !== id),
                    )
                  }
                />
                <span>
                  <strong>{p.full_name}</strong>
                  <small>{p.location}</small>
                </span>
              </label>
            );
          })}
      </div>
      <p className="muted">{selected.length} selected · Read-only access</p>
      <button
        className="text-button"
        onClick={() => setSelected([])}
        disabled={busy}
      >
        Clear selection
      </button>
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={busy || selected.length > 200}
          onClick={async () => {
            setBusy(true);
            try {
              if (!preview)
                await rpc("share_workspace_note", {
                  p_note: note.id,
                  p_users: selected,
                });
              await qc.invalidateQueries({
                queryKey: ["note-sharing", note.id],
              });
              toast(
                preview
                  ? "Preview: no notifications sent."
                  : "Sharing updated. New recipients have been notified.",
              );
              onClose();
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save sharing
        </button>
      </div>
    </>
  );
}
