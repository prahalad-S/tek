-- Audience-based map permissions, public birthday dates, and durable work activity.
alter table public.employee_map_locations add column shared_locations text[] not null default '{}',add column shared_users uuid[] not null default '{}';
create function private.can_view_map(p_owner uuid,p_shared boolean,p_locations text[],p_users uuid[]) returns boolean language plpgsql stable security definer set search_path='' as $$declare me public.memberships;them public.memberships;loc text;begin
 select * into me from public.memberships where user_id=auth.uid() and active;if me.user_id is null then return false;end if;
 if p_owner=auth.uid() or me.role='admin' then return true;end if;
 select * into them from public.memberships where user_id=p_owner and active;
 if me.role='manager' then return them.user_id is not null and me.department_id=them.department_id;end if;
 select location into loc from public.employees where user_id=auth.uid();
 return p_shared and (auth.uid()=any(p_users) or loc=any(p_locations));end;$$;
drop policy map_visibility on public.employee_map_locations;
create policy map_visibility on public.employee_map_locations for select to authenticated using(private.can_view_map(user_id,shared,shared_locations,shared_users));
create function public.save_my_map_sharing(p_lat double precision,p_lon double precision,p_address text,p_shared boolean,p_locations text[],p_users uuid[]) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_member();
 if cardinality(p_locations)>200 or cardinality(p_users)>1000 then raise exception 'Too many sharing recipients.';end if;
 if p_shared and coalesce(cardinality(p_locations),0)+coalesce(cardinality(p_users),0)=0 then raise exception 'Choose a location or person to share with.';end if;
 if exists(select 1 from unnest(p_users) u where not exists(select 1 from public.memberships m where m.user_id=u and m.active)) then raise exception 'Choose active workspace members.';end if;
 if exists(select 1 from unnest(p_locations) l where not exists(select 1 from public.employees e where e.location=l)) then raise exception 'Choose an existing location.';end if;
 perform public.save_my_map_pin(p_lat,p_lon,p_address,false);
 update public.employee_map_locations set shared=p_shared,shared_locations=case when p_shared then coalesce(p_locations,'{}') else '{}' end,shared_users=case when p_shared then coalesce(p_users,'{}') else '{}' end where user_id=auth.uid();end;$$;
create function public.calendar_birthdays(p_year integer) returns table(user_id uuid,full_name text,birthday date) language plpgsql stable security definer set search_path='' as $$begin
 perform private.assert_member();if p_year not between 1900 and 2200 then raise exception 'Invalid calendar year.';end if;
 return query select e.user_id,e.full_name,make_date(p_year,extract(month from d.dob)::integer,least(extract(day from d.dob)::integer,extract(day from (make_date(p_year,extract(month from d.dob)::integer,1)+interval '1 month - 1 day'))::integer)) from public.employees e join public.memberships m on m.user_id=e.user_id and m.active join public.employee_private_details d on d.user_id=e.user_id where d.dob is not null;end;$$;
create table public.workspace_activity(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),actor uuid,week_start date not null,target_id uuid,action text not null,created_at timestamptz not null default now());
create index workspace_activity_user_week on public.workspace_activity(user_id,week_start,created_at desc);
alter table public.workspace_activity enable row level security;
grant select on public.workspace_activity to authenticated;
create policy activity_read on public.workspace_activity for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.can_review(user_id)));
create function private.record_workspace_activity() returns trigger language plpgsql security definer set search_path='' as $$declare r jsonb;owner_id uuid;day date;label text;begin
 r=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if TG_TABLE_NAME='time_entries' then
 select user_id into owner_id from public.timesheets where id=(r->>'timesheet_id')::uuid;day=(r->>'work_date')::date;
 label=case when TG_OP='INSERT' then 'Added work entry' when TG_OP='DELETE' then 'Deleted work entry' when old.work_date is distinct from new.work_date then 'Moved entry to another date' else 'Updated work entry' end;
 elsif TG_TABLE_NAME='leave_requests' then
 owner_id=(r->>'user_id')::uuid;day=(r->>'from_date')::date;
 label=case when TG_OP='INSERT' then 'Applied for leave' when TG_OP='DELETE' then 'Deleted leave request' when old.status is distinct from new.status then 'Leave '||new.status when old.from_date is distinct from new.from_date or old.to_date is distinct from new.to_date then 'Changed leave dates' else 'Updated leave request' end;
 else
 owner_id=(r->>'user_id')::uuid;day=(r->>'week_start')::date;
 if TG_OP='UPDATE' and old.status is not distinct from new.status then return null;end if;
 label=case when TG_OP='INSERT' then 'Created timesheet' else 'Timesheet '||(r->>'status') end;
 end if;
 if current_setting('app.undoing',true)='yes' then label='Undid calendar change';end if;
 if owner_id is not null then insert into public.workspace_activity(user_id,actor,week_start,target_id,action) values(owner_id,auth.uid(),date_trunc('week',day)::date,(r->>'id')::uuid,label);end if;return null;end;$$;
create trigger work_activity after insert or update or delete on public.time_entries for each row execute function private.record_workspace_activity();
create trigger leave_activity after insert or update or delete on public.leave_requests for each row execute function private.record_workspace_activity();
create trigger sheet_activity after insert or update on public.timesheets for each row execute function private.record_workspace_activity();
create function private.record_calendar_action() returns trigger language plpgsql security definer set search_path='' as $$declare u uuid;d date;begin
 if new.action not in ('calendar.copy','calendar.extend') then return new;end if;
 select s.user_id,e.work_date into u,d from public.time_entries e join public.timesheets s on s.id=e.timesheet_id where e.id=new.target_id;
 if u is not null then insert into public.workspace_activity(user_id,actor,week_start,target_id,action) values(u,new.actor,date_trunc('week',d)::date,new.target_id,case when new.action='calendar.extend' then 'Extended entry across dates' else 'Copied work entry' end);end if;return new;end;$$;
create trigger calendar_action_activity after insert on public.audit_events for each row execute function private.record_calendar_action();
create table public.activity_hidden(viewer uuid not null references auth.users(id),activity_id uuid not null references public.workspace_activity(id) on delete cascade,primary key(viewer,activity_id));
alter table public.activity_hidden enable row level security;grant select on public.activity_hidden to authenticated;
create policy activity_hidden_read on public.activity_hidden for select to authenticated using(viewer=auth.uid() and private.is_member());
create function public.clear_workspace_history(p_sheets uuid[],p_activities uuid[]) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_member();perform public.clear_history(p_sheets);
 insert into public.activity_hidden select auth.uid(),a.id from public.workspace_activity a where a.id=any(p_activities) and (a.user_id=auth.uid() or private.can_review(a.user_id)) on conflict do nothing;end;$$;
revoke all on function public.save_my_map_sharing(double precision,double precision,text,boolean,text[],uuid[]),public.calendar_birthdays(integer),public.clear_workspace_history(uuid[],uuid[]) from public,anon;
grant execute on function public.save_my_map_sharing(double precision,double precision,text,boolean,text[],uuid[]),public.calendar_birthdays(integer),public.clear_workspace_history(uuid[],uuid[]) to authenticated;
revoke all on function private.record_workspace_activity(),private.record_calendar_action() from public,anon,authenticated;
