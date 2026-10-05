export type Employee = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  employee_code: string | null;
  title: string;
  department_id: string | null;
  location: string;
  bio: string;
  avatar_path: string | null;
  departments?: { name: string } | null;
  skills?: string[];
  joined_on?:string|null;
  archived_at?:string|null;
  departure_status?:string|null;
};
export type Member = {
  user_id: string;
  role: "employee" | "manager" | "admin";
  active: boolean;
  department_id: string | null;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  color: string;
  created_at?: string;
};
export type Entry = {
  id: string;
  timesheet_id: string;
  work_date: string;
  project_id: string;
  description: string;
  minutes: number;
  version: number;
  projects?: { name: string };
};
export type Timesheet = {
  id: string;
  user_id: string;
  week_start: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  version: number;
  submitted_at?: string;
  review_note?: string;
  employees?: { full_name: string };
};
export type DocumentRecord = {
  id: string;
  user_id: string;
  name: string;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
export type Notice = {
  note_id?: string | null;
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
