create function public.provision_employee(p_email text,p_name text,p_title text,p_department uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;begin if not private.is_admin() then raise exception 'Administrator access required.';end if;
 if lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid work email.';end if;
 insert into public.employees(email,full_name,title,department_id) values(lower(trim(p_email)),trim(p_name),left(p_title,120),p_department) returning id into v_id;
 insert into private.allowed_emails(email) values(lower(trim(p_email)));
 perform private.audit('employee.provisioned',v_id);return v_id;end; $$;
create function public.manage_membership(p_user uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin if not private.is_admin() or p_user=auth.uid() then raise exception 'You cannot change your own access.';end if;
 perform pg_advisory_xact_lock(749182);
 if exists(select 1 from public.memberships where user_id=p_user and active and role='admin') and (p_role<>'admin' or not p_active) and (select count(*) from public.memberships where role='admin' and active)<=1 then raise exception 'Keep at least one active administrator.';end if;
 update public.memberships set role=p_role,active=p_active where user_id=p_user;if not found then raise exception 'Account not found.';end if;perform private.audit('membership.updated',p_user);end; $$;
create function public.create_department(p_name text) returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin if not private.is_admin() then raise exception 'Administrator access required.';end if;if length(trim(p_name)) not between 1 and 100 then raise exception 'Enter a department name.';end if;insert into public.departments(name) values(trim(p_name)) returning id into v_id;return v_id;end; $$;
drop policy memberships_self on public.memberships;
create policy memberships_self_or_admin on public.memberships for select to authenticated using(user_id=auth.uid() or private.is_admin());
create or replace function public.propose_agent_entry(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;s public.timesheets;begin perform private.assert_member();if pg_column_size(p_payload)>8000 then raise exception 'Proposal too large.';end if;
 select * into s from public.timesheets where id=(p_payload->>'sheet_id')::uuid and user_id=auth.uid();if s.id is null or s.status not in ('draft','rejected') then raise exception 'Timesheet is not editable.';end if;
 insert into public.agent_actions(user_id,kind,payload) values(auth.uid(),'draft_time_entry',p_payload||jsonb_build_object('sheet_version',s.version)) returning id into v_id;return v_id;end; $$;
create or replace function public.confirm_agent_action(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.agent_actions;s public.timesheets;v_id uuid;begin perform private.assert_member();select * into a from public.agent_actions where id=p_id and user_id=auth.uid() for update;
 if a.id is null then raise exception 'Action not found.';end if;if a.status='executed' then return a.result_id;end if;if a.status<>'proposed' or a.expires_at<now() then raise exception 'Proposal expired or cancelled. Prepare a new one.';end if;
 select * into s from public.timesheets where id=(a.payload->>'sheet_id')::uuid and user_id=auth.uid() for update;
 if s.id is null or s.version<>(a.payload->>'sheet_version')::integer or s.status not in ('draft','rejected') then raise exception 'Your timesheet changed. Prepare a new proposal.';end if;
 v_id:=public.save_time_entry(s.id,(a.payload->>'date')::date,(a.payload->>'project_id')::uuid,a.payload->>'description',(a.payload->>'minutes')::integer);
 update public.agent_actions set status='executed',result_id=v_id where id=p_id;perform private.audit('assistant.action_confirmed',p_id);return v_id;end; $$;
revoke all on function public.provision_employee(text,text,text,uuid),public.manage_membership(uuid,text,boolean),public.create_department(text) from public,anon;
grant execute on function public.provision_employee(text,text,text,uuid),public.manage_membership(uuid,text,boolean),public.create_department(text) to authenticated;
