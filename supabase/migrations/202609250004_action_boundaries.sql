-- Prepare an assistant action without creating an empty business timesheet.
create or replace function public.propose_agent_entry(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;s public.timesheets;v_week date;begin perform private.assert_member();if pg_column_size(p_payload)>8000 then raise exception 'Proposal too large.';end if;
 v_week:=date_trunc('week',(p_payload->>'date')::date)::date;
 select * into s from public.timesheets where week_start=v_week and user_id=auth.uid();
 if s.id is not null and s.status not in ('draft','rejected') then raise exception 'Timesheet is not editable.';end if;
 insert into public.agent_actions(user_id,kind,payload) values(auth.uid(),'draft_time_entry',(p_payload-'sheet_id')||jsonb_build_object('week',v_week,'sheet_version',coalesce(s.version,1))) returning id into v_id;return v_id;end; $$;
create or replace function public.confirm_agent_action(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.agent_actions;s public.timesheets;v_id uuid;begin perform private.assert_member();select * into a from public.agent_actions where id=p_id and user_id=auth.uid() for update;
 if a.id is null then raise exception 'Action not found.';end if;if a.status='executed' then return a.result_id;end if;if a.status<>'proposed' or a.expires_at<now() then raise exception 'Proposal expired or cancelled. Prepare a new one.';end if;
 s:=public.get_or_create_timesheet((a.payload->>'week')::date);
 select * into s from public.timesheets where id=s.id and user_id=auth.uid() for update;
 if s.id is null or s.version<>(a.payload->>'sheet_version')::integer or s.status not in ('draft','rejected') then raise exception 'Your timesheet changed. Prepare a new proposal.';end if;
 v_id:=public.save_time_entry(s.id,(a.payload->>'date')::date,(a.payload->>'project_id')::uuid,a.payload->>'description',(a.payload->>'minutes')::integer);
 update public.agent_actions set status='executed',result_id=v_id where id=p_id;perform private.audit('assistant.action_confirmed',p_id);return v_id;end; $$;
create function public.create_calendar_item(p_kind text,p_name text,p_start timestamptz,p_end timestamptz,p_description text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;begin perform private.assert_member();if not exists(select 1 from public.memberships where user_id=auth.uid() and role in ('admin','manager')) then raise exception 'Manager access required.';end if;
 if length(trim(p_name)) not between 1 and 120 or length(p_description)>2000 then raise exception 'Invalid event details.';end if;
 if p_kind='holiday' then insert into public.holidays(name,day) values(trim(p_name),(p_start at time zone 'UTC')::date) returning id into v_id;
 elsif p_kind='event' then insert into public.events(name,starts_at,ends_at,description) values(trim(p_name),p_start,p_end,p_description) returning id into v_id;
 else raise exception 'Unknown calendar item type.';end if;perform private.audit('calendar.created',v_id);return v_id;end; $$;
revoke all on function public.create_calendar_item(text,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.create_calendar_item(text,text,timestamptz,timestamptz,text) to authenticated;
