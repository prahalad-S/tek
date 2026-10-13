-- Assign directory employees before they have activated a portal account.
begin;
create table public.project_employee_assignments (
 project_id uuid not null references public.projects(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 primary key(project_id, employee_id)
);
alter table public.project_employee_assignments enable row level security;
create policy project_employee_assignments_read on public.project_employee_assignments
 for select to authenticated using(private.is_member());
grant select on public.project_employee_assignments to authenticated;
insert into public.project_employee_assignments(project_id,employee_id)
 select m.project_id,e.id from public.project_memberships m join public.employees e on e.user_id=m.user_id on conflict do nothing;
create view public.project_team_directory with (security_invoker=true) as
 select a.project_id,a.employee_id,e.user_id from public.project_employee_assignments a join public.employees e on e.id=a.employee_id
 union select m.project_id,e.id,e.user_id from public.project_memberships m join public.employees e on e.user_id=m.user_id;
grant select on public.project_team_directory to authenticated;
create function public.set_project_employee(p_project uuid,p_employee uuid,p_assigned boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 perform private.assert_member();
 if not exists(select 1 from public.memberships where user_id=auth.uid() and active and role in ('manager','admin')) then raise exception 'Manager access required.'; end if;
 perform 1 from public.projects where id=p_project for update;
 if not found then raise exception 'Project not found.'; end if;
 select user_id into v_user from public.employees where id=p_employee for update;
 if not found then raise exception 'Employee not found.'; end if;
 if p_assigned then
  insert into public.project_employee_assignments values(p_project,p_employee) on conflict do nothing;
  if v_user is not null then insert into public.project_memberships values(p_project,v_user) on conflict do nothing; end if;
 else
  delete from public.project_employee_assignments where project_id=p_project and employee_id=p_employee;
  delete from public.project_memberships where project_id=p_project and user_id=v_user;
 end if;
 perform private.audit(case when p_assigned then 'project.member_added' else 'project.member_removed' end,p_project);
end;$$;
revoke all on function public.set_project_employee(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_project_employee(uuid,uuid,boolean) to authenticated;
-- Preserve existing consumers and migrate existing assignments when a login activates.
create function private.sync_directory_project_login() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is not null and new.user_id is distinct from old.user_id then
  insert into public.project_memberships(project_id,user_id)
   select project_id,new.user_id from public.project_employee_assignments where employee_id=new.id on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger sync_directory_project_login after update of user_id on public.employees for each row execute function private.sync_directory_project_login();
create function public.delete_project(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_member();
 if not exists(select 1 from public.memberships where user_id=auth.uid() and active and role in ('manager','admin')) then raise exception 'Manager access required.'; end if;
 perform 1 from public.projects where id=p_project for update;
 if not found then raise exception 'Project not found.'; end if;
 if exists(select 1 from public.time_entries where project_id=p_project) then raise exception 'This project has recorded time. Mark it completed instead to preserve timesheet history.'; end if;
 delete from public.projects where id=p_project;
 perform private.audit('project.deleted',p_project);
end;$$;
revoke all on function public.delete_project(uuid) from public,anon;
grant execute on function public.delete_project(uuid) to authenticated;
-- Keep assignments consistent for older clients still calling set_project_member.
create function private.mirror_project_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op = 'DELETE' then
  delete from public.project_employee_assignments where project_id=old.project_id and employee_id in(select id from public.employees where user_id=old.user_id);
  return old;
 end if;
 insert into public.project_employee_assignments(project_id,employee_id)
  select new.project_id,id from public.employees where user_id=new.user_id on conflict do nothing;
 return new;
end;$$;
create trigger mirror_project_membership after insert or delete on public.project_memberships for each row execute function private.mirror_project_membership();
commit;
