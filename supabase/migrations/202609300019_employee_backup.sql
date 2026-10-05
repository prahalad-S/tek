create function public.export_employee_backup(p_employee uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare e public.employees;begin
 if not private.is_admin() then raise exception 'Administrator access required.';end if;
 select * into e from public.employees where id=p_employee;if e.id is null then raise exception 'Employee not found.';end if;
 return jsonb_build_object('schema_version',1,'exported_at',now(),'employee',to_jsonb(e),
'private_details',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_private_details r where r.employee_id=e.id),'[]'::jsonb),
'professional_profile',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_profiles r where r.employee_id=e.id),'[]'::jsonb),
'experience',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_experience r where r.employee_id=e.id),'[]'::jsonb),
'education',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_education r where r.employee_id=e.id),'[]'::jsonb),
'achievements',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_achievements r where r.employee_id=e.id),'[]'::jsonb),
'skills',coalesce((select jsonb_agg(to_jsonb(r)) from public.skills r where r.id in(select skill_id from public.employee_skills where employee_id=e.id)),'[]'::jsonb),
'membership',coalesce((select jsonb_agg(to_jsonb(r)) from public.memberships r where r.user_id=e.user_id),'[]'::jsonb),
'timesheets',coalesce((select jsonb_agg(to_jsonb(r)) from public.timesheets r where r.user_id=e.user_id),'[]'::jsonb),
'entries',coalesce((select jsonb_agg(to_jsonb(r)) from public.time_entries r where r.timesheet_id in(select id from public.timesheets where user_id=e.user_id)),'[]'::jsonb),
'timesheet_revisions',coalesce((select jsonb_agg(to_jsonb(r)) from public.timesheet_revisions r where r.timesheet_id in(select id from public.timesheets where user_id=e.user_id)),'[]'::jsonb),
'activity',coalesce((select jsonb_agg(to_jsonb(r)) from public.workspace_activity r where r.user_id=e.user_id),'[]'::jsonb),
'leave_requests',coalesce((select jsonb_agg(to_jsonb(r)) from public.leave_requests r where r.user_id=e.user_id),'[]'::jsonb),
'calendar_access_requests',coalesce((select jsonb_agg(to_jsonb(r)) from public.calendar_access_requests r where r.user_id=e.user_id),'[]'::jsonb),
'project_memberships',coalesce((select jsonb_agg(to_jsonb(r)) from public.project_memberships r where r.user_id=e.user_id),'[]'::jsonb),
'projects',coalesce((select jsonb_agg(to_jsonb(r)) from public.projects r where r.id in(select project_id from public.project_memberships where user_id=e.user_id) or r.id in(select t.project_id from public.time_entries t join public.timesheets s on s.id=t.timesheet_id where s.user_id=e.user_id)),'[]'::jsonb),
'profile_documents',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_documents r where r.user_id=e.user_id),'[]'::jsonb),
'map_locations',coalesce((select jsonb_agg(to_jsonb(r)) from public.employee_map_locations r where r.employee_id=e.id),'[]'::jsonb),
'agent_actions',coalesce((select jsonb_agg(to_jsonb(r)) from public.agent_actions r where r.user_id=e.user_id),'[]'::jsonb),
'audit_events',coalesce((select jsonb_agg(to_jsonb(r)) from public.audit_events r where r.actor=e.user_id or r.target_id=e.id or r.target_id=e.user_id or r.target_id in(select id from public.timesheets where user_id=e.user_id) or r.target_id in(select t.id from public.time_entries t join public.timesheets s on s.id=t.timesheet_id where s.user_id=e.user_id) or r.target_id in(select id from public.leave_requests where user_id=e.user_id)),'[]'::jsonb),
'calendar_change_history',coalesce((select jsonb_agg(to_jsonb(r)) from private.calendar_undo r where (coalesce(r.before_row,r.after_row)->>'user_id')=e.user_id::text or (coalesce(r.before_row,r.after_row)->>'timesheet_id') in(select id::text from public.timesheets where user_id=e.user_id)),'[]'::jsonb),
'created_events',coalesce((select jsonb_agg(to_jsonb(r)) from public.events r where r.created_by=e.user_id),'[]'::jsonb),
'created_holidays',coalesce((select jsonb_agg(to_jsonb(r)) from public.holidays r where r.created_by=e.user_id),'[]'::jsonb),
'work_notifications',coalesce((select jsonb_agg(to_jsonb(r)) from public.notifications r where r.user_id=e.user_id and r.note_id is null),'[]'::jsonb)
 );end;$$;
revoke all on function public.export_employee_backup(uuid) from public,anon;
grant execute on function public.export_employee_backup(uuid) to authenticated;
