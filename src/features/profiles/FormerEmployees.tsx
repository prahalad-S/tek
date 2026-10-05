import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { Loading, ErrorState } from "../../components/ui";
export default function FormerEmployees() {
  const { preview, member } = useAuth();
  const [status, setStatus] = useState(""),
    [sort, setSort] = useState("asc");
  const q = useQuery({
    queryKey: ["former-employees", preview],
    queryFn: async () => {
      if (preview) return [];
      const r = await client()
        .from("employees")
        .select(
          "id,full_name,email,location,archived_at,departure_status,employee_profiles(employment_status)",
        )
        .order("full_name");
      if (r.error) throw r.error;
      return r.data
        .map((e: any) => ({
          ...e,
          status:
            e.departure_status ||
            e.employee_profiles?.employment_status ||
            e.employee_profiles?.[0]?.employment_status ||
            "",
        }))
        .filter((e) => ["left", "terminated"].includes(e.status.toLowerCase()));
    },
  });
  const rows = (q.data || [])
    .filter((e) => !status || e.status.toLowerCase() === status.toLowerCase())
    .sort(
      (a, b) =>
        a.full_name.localeCompare(b.full_name) * (sort === "asc" ? 1 : -1),
    );
  return (
    <section className="panel spaced-panel">
      <div className="panel-heading">
        <div>
          <h2>Former employees</h2>
          <p>
            Employees who left or were terminated. Historical records are
            retained.
          </p>
        </div>
        <div className="row-actions">
          <select
            aria-label="Former employee status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option>Left</option>
            <option>Terminated</option>
          </select>
          <select
            aria-label="Sort former employees"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="asc">Name A–Z</option>
            <option value="desc">Name Z–A</option>
          </select>
        </div>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    {member?.role === "admin" ? (
                      <Link
                        to={`${preview ? "/preview" : ""}/profile?employee=${e.id}`}
                      >
                        {e.full_name}
                      </Link>
                    ) : (
                      <strong>{e.full_name}</strong>
                    )}
                    <small>{e.email}</small>
                  </td>
                  <td>{e.location || "Not added"}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3}>No former employees match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
