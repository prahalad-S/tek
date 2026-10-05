import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../app/providers";
import { client } from "./supabase";
import type { Employee } from "./types";
export function useProfileManagement() {
  const { member, profile, preview } = useAuth();
  const q = useQuery({
    queryKey: ["profile-editor-scopes", profile?.id, preview],
    enabled: !!profile && !preview && member?.role !== "admin",
    queryFn: async () => {
      const r = await client()
        .from("profile_editor_scopes")
        .select("location")
        .eq("employee_id", profile!.id);
      if (r.error) throw r.error;
      return r.data.map((row) => row.location.toLowerCase().trim());
    },
  });
  const admin = member?.role === "admin";
  return {
    admin,
    pending: q.isFetching,
    hasScope: admin || !!q.data?.length,
    canManage: (employee: Employee) =>
      admin || !!q.data?.includes(employee.location.toLowerCase().trim()),
  };
}
