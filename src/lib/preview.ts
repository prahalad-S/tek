import type { Employee, Entry, Project, Timesheet } from "./types";
import { dateKey, weekStart, weekDays } from "./domain";
// Invented demonstration records only. Never substitute these for a failed live request.
const people = [
  ["Alex Morgan", "Product designer", "Design", "London, UK"],
  ["Jordan Lee", "Frontend engineer", "Engineering", "Hyderabad, IN"],
  ["Maya Chen", "Design lead", "Design", "Singapore, SG"],
  ["Noah Williams", "Product manager", "Product", "London, UK"],
  ["Sofia Rivera", "People partner", "People", "Remote"],
  ["Ethan Brooks", "Backend engineer", "Engineering", "Bengaluru, IN"],
  ["Amara Okafor", "UX researcher", "Design", "London, UK"],
  ["Lucas Martin", "Platform engineer", "Engineering", "Paris, FR"],
  ["Priya Shah", "Product designer", "Design", "Mumbai, IN"],
  ["Oliver Kim", "Engineering lead", "Engineering", "Singapore, SG"],
  ["Isabella Rossi", "Customer success", "Operations", "Milan, IT"],
  ["Daniel Park", "Data analyst", "Product", "Remote"],
];
export const previewEmployees: Employee[] = people.map(
  ([full_name, title, dept, location], i) => ({
    id: `demo-${i}`,
    user_id: i === 0 ? "preview" : `preview-user-${i}`,
    email: `${full_name.toLowerCase().replaceAll(" ", ".")}@example.test`,
    full_name,
    title,
    department_id: dept,
    departments: { name: dept },
    employee_code: i === 0 ? null : `SP-${100 + i}`,
    location,
    bio: "Building thoughtful experiences with a kind, curious team.",
    avatar_path: null,
    joined_on: [
      "2015-06-15",
      "2018-09-01",
      "2016-03-20",
      "2019-11-05",
      "2020-07-14",
      "2021-02-18",
      "2022-06-01",
      "2017-08-15",
      "2019-05-10",
      "2016-10-25",
      "2023-01-16",
      "2024-03-01",
    ][i % 12],
  }),
);
export const previewProjects: Project[] = [
  {
    id: "p1",
    name: "Tekzenit redesign",
    description:
      "A more thoughtful home for people, projects, and everyday work.",
    status: "active",
    color: "#7861dc",
  },
  {
    id: "p2",
    name: "Design system",
    description:
      "Shared foundations that make every experience feel connected.",
    status: "active",
    color: "#d89960",
  },
  {
    id: "p3",
    name: "Platform experience",
    description:
      "Reliable tools that give our teams room to do their best work.",
    status: "active",
    color: "#47978b",
  },
  {
    id: "p4",
    name: "Customer insights",
    description: "Turning useful conversations into clear product direction.",
    status: "paused",
    color: "#688fce",
  },
];
export const previewSheet: Timesheet = {
  id: "s1",
  user_id: "preview",
  week_start: weekStart(),
  status: "draft",
  version: 1,
};
// Stable pseudo-random fixtures: eight weeks of weekday work for every fictional employee.
// Never written to Supabase. Remove this generator to clear all seeded demonstration work.
export const previewWork = previewEmployees.flatMap((employee, personIndex) => {
  return Array.from({ length: 8 }, (_, weekIndex) => {
    const date = new Date(weekStart() + "T12:00:00");
    date.setDate(date.getDate() + (weekIndex - 6) * 7);
    const start = dateKey(date);
    return weekDays(start)
      .slice(0, 5)
      .flatMap((work_date, day) => {
        const seed = (personIndex * 17 + weekIndex * 13 + day * 7) % 23;
        const first = 180 + (seed % 5) * 30;
        return [first, 480 - first].map((minutes, part) => {
          const project =
            previewProjects[
              (personIndex + weekIndex + day + part) % previewProjects.length
            ];
          return {
            id: `demo-work-${personIndex}-${weekIndex}-${day}-${part}`,
            timesheet_id: `demo-sheet-${personIndex}-${start}`,
            work_date,
            project_id: project.id,
            description: [
              "Feature implementation and review",
              "Planning and stakeholder meeting",
              "Testing and accessibility checks",
              "Research and documentation",
              "Bug fixes and quality review",
            ][(seed + part) % 5],
            minutes,
            version: 1,
            projects: { name: project.name },
            task_status: ["In Progress", "Completed", "In Progress"][
              (seed + part) % 3
            ],
            timesheets: {
              user_id: employee.user_id!,
              status: weekIndex < 6 ? "approved" : "draft",
            },
          };
        });
      });
  }).flat();
});
export const previewEntries: Entry[] = previewWork.filter(
  (entry) =>
    entry.timesheets.user_id === "preview" &&
    weekDays(weekStart()).includes(entry.work_date),
);
