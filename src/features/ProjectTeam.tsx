import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import { rpc } from "../lib/api";
import { errorMessage } from "../lib/domain";
import { Loading, ErrorState, useToast } from "../components/ui";
export default function ProjectTeam({
  projectId,
  manage,
}: {
  projectId: string;
  manage: boolean;
}) {
  const { preview } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["project-team", projectId, preview],
    queryFn: async () => {
      if (preview)
        return {
          people: [] as { user_id: string; full_name: string }[],
          members: [] as { user_id: string }[],
        };
      const [people, members] = await Promise.all([
        client()
          .from("employees")
          .select("user_id,full_name")
          .not("user_id", "is", null)
          .order("full_name")
          .limit(1000),
        client()
          .from("project_memberships")
          .select("user_id")
          .eq("project_id", projectId),
      ]);
      if (people.error) throw people.error;
      if (members.error) throw members.error;
      return {
        people: people.data as { user_id: string; full_name: string }[],
        members: members.data,
      };
    },
  });
  async function assign(user: string, assigned: boolean) {
    setBusy(true);
    try {
      await rpc("set_project_member", {
        p_project: projectId,
        p_user: user,
        p_assigned: assigned,
      });
      await qc.invalidateQueries({ queryKey: ["project-team", projectId] });
      await qc.invalidateQueries({ queryKey: ["project-avatars"] });
      await qc.invalidateQueries({ queryKey: ["analytics-directory"] });
      toast(assigned ? "Teammate added." : "Teammate removed.");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="project-team">
      <h3>Project team</h3>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <>
          <ul>
            {q.data.members.map((m) => (
              <li key={m.user_id}>
                <span>
                  {q.data.people.find((p) => p.user_id === m.user_id)
                    ?.full_name || "Workspace member"}
                </span>
                {manage && (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void assign(m.user_id, false)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!q.data.members.length && (
            <p className="muted">
              {preview
                ? "Team assignments are available in your connected workspace."
                : "No teammates assigned yet."}
            </p>
          )}
          {manage && !preview && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = new FormData(e.currentTarget).get("teammate");
                if (value) void assign(String(value), true);
              }}
            >
              <label>
                Add a teammate
                <select name="teammate" required defaultValue="">
                  <option value="" disabled>
                    Choose an activated employee
                  </option>
                  {q.data.people
                    .filter(
                      (p) =>
                        !q.data.members.some((m) => m.user_id === p.user_id),
                    )
                    .map((p) => (
                      <option value={p.user_id} key={p.user_id}>
                        {p.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <button className="button secondary" disabled={busy}>
                Add to team
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
