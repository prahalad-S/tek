import { client } from "./supabase";
import type { Employee } from "./types";
export type CareerItem = {
  id?: string;
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  description: string;
};
export type EducationItem = {
  id?: string;
  institution: string;
  qualification: string;
  start_year: string;
  end_year: string;
};
export type Achievement = {
  id?: string;
  kind: string;
  title: string;
  description: string;
  url: string;
};
export type ExtendedProfile = {
  profile: {
    joined_on: string;
    employment_status: string;
    languages: string[];
    summary: string;
    website: string;
  };
  experience: CareerItem[];
  education: EducationItem[];
  achievements: Achievement[];
  skills: string[];
  privateDetails: Record<string, string> | null;
  documents: any[];
};
export const emptyExtended = (): ExtendedProfile => ({
  profile: {
    joined_on: "",
    employment_status: "Active",
    languages: [],
    summary: "",
    website: "",
  },
  experience: [],
  education: [],
  achievements: [],
  skills: [],
  privateDetails: null,
  documents: [],
});
export async function directoryPeople(
  includeFormer = false,
): Promise<Employee[]> {
  const all: Employee[] = [];
  for (let start = 0; ; start += 200) {
    const { data, error } = await client()
      .from("employees")
      .select(
        "*,departments(name),employee_profiles(joined_on,employment_status)",
      )
      .order("full_name").order("id")
      .range(start, start + 199);
    if (error) throw error;
    all.push(
      ...data
        .filter(
          (row: any) =>
            includeFormer ||
            (!row.archived_at &&
              !["left", "terminated"].includes(
                (
                  row.departure_status ||
                  row.employee_profiles?.employment_status ||
                  row.employee_profiles?.[0]?.employment_status ||
                  ""
                ).toLowerCase(),
              )),
        )
        .map((row: any) => ({
          ...row,
          departure_status:
            row.departure_status ||
            row.employee_profiles?.employment_status ||
            row.employee_profiles?.[0]?.employment_status ||
            "Active",
          joined_on:
            row.employee_profiles?.joined_on ||
            row.employee_profiles?.[0]?.joined_on ||
            null,
        })),
    );
    if (data.length < 200) break;
  }
  return [...new Map(all.map(person=>[person.id,person])).values()];
}
export async function extendedProfile(
  employee: Employee,
  canPrivate: boolean,
): Promise<ExtendedProfile> {
  const results = await Promise.all([
    client()
      .from("employee_profiles")
      .select("*")
      .eq("employee_id", employee.id)
      .maybeSingle(),
    client()
      .from("employee_experience")
      .select("*")
      .eq("employee_id", employee.id)
      .order("start_date", { ascending: false }),
    client()
      .from("employee_education")
      .select("*")
      .eq("employee_id", employee.id)
      .order("end_year", { ascending: false }),
    client()
      .from("employee_achievements")
      .select("*")
      .eq("employee_id", employee.id),
    client()
      .from("employee_skills")
      .select("skills(name)")
      .eq("employee_id", employee.id),
    canPrivate
      ? client()
          .from("employee_private_details")
          .select("*")
          .eq("employee_id", employee.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    employee.user_id
      ? client()
          .from("employee_documents")
          .select("*")
          .eq("user_id", employee.user_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of results) if (r.error) throw r.error;
  return {
    profile: { ...emptyExtended().profile, ...results[0].data },
    experience: results[1].data as any,
    education: results[2].data as any,
    achievements: results[3].data as any,
    skills: (results[4].data as any[]).map((r) => r.skills.name),
    privateDetails: results[5].data as any,
    documents: results[6].data as any,
  };
}
export function previewExtended(employee: Employee): ExtendedProfile {
  return {
    ...emptyExtended(),
    profile: {
      ...emptyExtended().profile,
      joined_on: "2022-06-15",
      summary:
        employee.bio ||
        "Building thoughtful experiences with a collaborative team.",
      languages: ["English"],
    },
    skills: employee.skills || ["Collaboration", "Problem solving"],
    privateDetails: employee.user_id === "preview" ? {} : null,
    experience: [
      {
        company: "Tekzenit",
        role: employee.title,
        start_date: "",
        end_date: "",
        description: "Current role — fictional design preview.",
      },
    ],
  };
}
