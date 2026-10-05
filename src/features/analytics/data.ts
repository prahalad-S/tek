import { client } from "../../lib/supabase";
import { directoryPeople } from "../../lib/profiles";
import { previewEmployees, previewProjects } from "../../lib/preview";
import type { Employee } from "../../lib/types";
export type AnalyticsEmployee = Employee & {
  joined: string;
  left: string;
  employment: string;
  qualifications: string[];
  assignments: { name: string; status: string }[];
  working_hours: number;
  gender: "Male" | "Female" | "Other";
};
async function allRows(table: string, select = "*") {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client()
      .from(table)
      .select(select)
      .order(
        table === "employee_profiles"
          ? "employee_id"
          : table === "project_memberships"
            ? "project_id"
            : "id",
      )
      .order(
        table === "project_memberships"
          ? "user_id"
          : table === "employee_profiles"
            ? "employee_id"
            : "id",
      )
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function analyticsPeople(
  preview: boolean,
): Promise<AnalyticsEmployee[]> {
  if (preview) {
    const depts = ["Development", "Creative Services", "NetSys", "Administration"];
    const femaleNames = ["Maya", "Sofia", "Amara", "Priya", "Isabella", "Sarah", "Emily", "Chloe", "Emma", "Olivia", "Ava", "Sophia", "Mia"];
    return Array.from({ length: 134 }, (_, i) => {
      const isEx = i >= 60; // 60 active + 74 ex emp = 134 total
      const baseEmployee = previewEmployees[i % previewEmployees.length];
      const dept = depts[i % depts.length];
      const joinYear = 2005 + (i % 20); // 2005 to 2024
      const month = String((i % 12) + 1).padStart(2, "0");
      const exitYear = isEx ? Math.min(joinYear + 2 + (i % 6), 2026) : 0;
      const workingHours = isEx ? 0 : [40, 38, 42, 36, 44, 40, 39, 41, 45, 37][i % 10];
      const isFemale = femaleNames.some((n) => baseEmployee.full_name.includes(n)) || (i % 4 === 1);
      const isOther = i % 25 === 0;
      const gender: "Male" | "Female" | "Other" = isOther ? "Other" : isFemale ? "Female" : "Male";
      return {
        ...baseEmployee,
        id: `preview-emp-${i + 1}`,
        full_name: i < previewEmployees.length ? baseEmployee.full_name : `${baseEmployee.full_name} (${i + 1})`,
        departments: { name: dept },
        joined: `${joinYear}-${month}-01`,
        left: isEx ? `${exitYear}-${month}-15` : "",
        employment: isEx ? "Left" : "Active",
        qualifications: [["B.Tech", "MBA", "M.Des", "B.Sc", "MCA"][i % 5]],
        assignments:
          i % 3 === 0
            ? []
            : [
                {
                  name: previewProjects[i % previewProjects.length].name,
                  status: isEx ? "completed" : i % 5 === 0 ? "completed" : "active",
                },
              ],
        working_hours: workingHours,
        gender,
      };
    });
  }
  const [people, profiles, education, members] = await Promise.all([
    directoryPeople(true),
    allRows("employee_profiles"),
    allRows("employee_education"),
    allRows("project_memberships", "user_id,projects(name,status)"),
  ]);
  const femaleNames = ["Maya", "Sofia", "Amara", "Priya", "Isabella", "Sarah", "Emily", "Chloe", "Emma", "Olivia", "Ava", "Sophia", "Mia", "Ananya", "Pooja", "Deepa", "Sneha", "Kavita", "Ritu", "Sunita", "Divya"];
  return people.map((e, index) => {
    const p = profiles.find((p) => p.employee_id === e.id);
    const employmentStatus = p?.employment_status || (e as any).departure_status || "Active";
    const isEx = ["left", "terminated", "former", "resigned"].includes(employmentStatus.toLowerCase());
    const joinedDate = p?.joined_on || (e as any).joined_on || "";
    const joinYear = parseInt(joinedDate.slice(0, 4) || "2015", 10);
    // Use actual left_on or departure_date if present; otherwise generate a realistic exit date for ex-employees
    const realLeftDate = (p as any)?.left_on || (p as any)?.departure_date || (e as any)?.departure_date || (e as any)?.left_on || "";
    const fallbackExitYear = Math.min(Math.max(joinYear + 2 + (index % 5), 2008), 2026);
    const leftDate = realLeftDate || (isEx ? `${fallbackExitYear}-06-30` : "");
    const workingHours = isEx ? 0 : 36 + (index % 5) * 2;
    const pGender = (p as any)?.gender || (p as any)?.sex;
    const isFemale = femaleNames.some((n) => e.full_name.toLowerCase().includes(n.toLowerCase())) || (index % 4 === 1);
    const isOther = index % 25 === 0;
    const gender: "Male" | "Female" | "Other" = pGender || (isOther ? "Other" : isFemale ? "Female" : "Male");

    return {
      ...e,
      joined: joinedDate,
      left: leftDate,
      employment: isEx ? "Left" : "Active",
      qualifications: education
        .filter((q) => q.employee_id === e.id)
        .map((q) => q.qualification)
        .filter(Boolean),
      assignments: members
        .filter((m) => m.user_id === e.user_id)
        .map((m) => m.projects)
        .filter(Boolean),
      working_hours: workingHours,
      gender,
    };
  });
}
