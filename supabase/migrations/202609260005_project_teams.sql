-- Team assignments stay relational; membership does not grant project or approval privileges.
create function public.set_project_member(p_project uuid,p_user uuid,p_assigned boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_member();
 if not exists(select 1 from public.memberships where user_id=auth.uid() and role in ('manager','admin')) then raise exception 'Manager access required.';end if;
 perform 1 from public.projects where id=p_project for update;
 if not found then raise exception 'Project not found.';end if;
 if p_assigned then
  if not exists(select 1 from public.memberships where user_id=p_user and active) then raise exception 'Choose an active employee.';end if;
  insert into public.project_memberships(project_id,user_id) values(p_project,p_user) on conflict do nothing;
 else delete from public.project_memberships where project_id=p_project and user_id=p_user;
 end if;
 perform private.audit(case when p_assigned then 'project.member_added' else 'project.member_removed' end,p_project);
end;$$;
revoke all on function public.set_project_member(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_project_member(uuid,uuid,boolean) to authenticated;
