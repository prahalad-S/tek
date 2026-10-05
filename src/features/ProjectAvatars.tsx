import { useQuery } from "@tanstack/react-query";
import { Avatar } from "../components/ui";
import { client } from "../lib/supabase";
import { directoryPeople } from "../lib/profiles";
import { previewEmployees } from "../lib/preview";
import type { Employee } from "../lib/types";
function rank(value: string) {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
export function useProjectAvatars(preview: boolean) {
  return useQuery({
    queryKey: ["project-avatars", preview],
    queryFn: async () => {
      if (preview)
        return {
          people: previewEmployees,
          members: [] as { project_id: string; user_id: string }[],
        };
      const people = await directoryPeople();
      const members: { project_id: string; user_id: string }[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await client()
          .from("project_memberships")
          .select("project_id,user_id")
          .order("project_id")
          .order("user_id")
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        members.push(...r.data);
        if (r.data.length < 500) break;
      }
      return { people, members };
    },
  });
}
export function ProjectAvatars({
  projectId,
  data,
  pending,
  error,
}: {
  projectId: string;
  data?: {
    people: Employee[];
    members: { project_id: string; user_id: string }[];
  };
  pending: boolean;
  error: boolean;
}) {
  if (pending)
    return (
      <span className="project-people">
        <span className="muted">Loading people…</span>
      </span>
    );
  if (error)
    return <span className="project-people muted">People unavailable</span>;
  const ids = new Set(
    data?.members
      .filter((m) => m.project_id === projectId)
      .map((m) => m.user_id),
  );
  const team =
    data?.people.filter((p) => p.user_id && ids.has(p.user_id)) || [];
  const spotlight = !team.length;
  const people = spotlight
    ? [...(data?.people || [])]
        .sort((a, b) => rank(projectId + a.id) - rank(projectId + b.id))
        .slice(0, 6)
    : team;
  return (
    <span className="project-people">
      <span
        className="project-avatar-stack"
        aria-label={
          (spotlight ? "Employee spotlight: " : "Project team: ") +
          people.map((p) => p.full_name).join(", ")
        }
      >
        {people.slice(0, 4).map((p) => (
          <span
            className="project-avatar-person"
            title={p.full_name}
            key={p.id}
          >
            <Avatar person={p} size="small" />
          </span>
        ))}
        {people.length > 4 && (
          <span
            className="project-avatar-overflow"
            title={people
              .slice(4)
              .map((p) => p.full_name)
              .join(", ")}
          >
            +{people.length - 4}
          </span>
        )}
      </span>
      <span className="project-people-label">
        {people.length
          ? spotlight
            ? "Employee spotlight"
            : `${people.length} teammates`
          : "No teammates yet"}
      </span>
    </span>
  );
}
