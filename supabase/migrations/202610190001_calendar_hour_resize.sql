-- Atomic resize, retaining one timesheet record per day and a shared span identity.
alter table public.time_entries add column if not exists calendar_span_id uuid;
alter table public.time_entries add column if not exists calendar_span_start date;
create index if not exists time_entries_calendar_span_idx on public.time_entries(calendar_span_id);
create or replace function public.resize_calendar_entry(p_id uuid,p_version integer,p_date date,p_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
declare e public.time_entries; r public.time_entries; u uuid; start_date date; span uuid; d date; v uuid; m integer;
begin
 perform private.assert_member();
 select t.user_id into u from public.time_entries x join public.timesheets t on t.id=x.timesheet_id where x.id=p_id;
 if u is null then raise exception 'Entry unavailable.'; end if;
 perform private.assert_calendar_date(u,p_date);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into e from public.time_entries where id=p_id for update;
 if e.version is distinct from p_version then raise exception 'Entry changed. Refresh and retry.'; end if;
 start_date:=coalesce(e.calendar_span_start,e.work_date); span:=coalesce(e.calendar_span_id,gen_random_uuid());
 if p_date is null or p_date<start_date or p_date-start_date>31 or p_minutes is null or p_minutes<60 or p_minutes>480 or p_minutes%60<>0 then raise exception 'Choose 1 to 8 hours per day, within 32 days.'; end if;
 -- All existing span records are checked before any are changed, including a shortened tail.
 for r in select * from public.time_entries where id=e.id or calendar_span_id=span for update loop
  perform private.assert_calendar_date(u,r.work_date);
  if not exists(select 1 from public.timesheets where id=r.timesheet_id and user_id=u and status in ('draft','rejected')) then raise exception 'Timesheet is locked for review.'; end if;
 end loop;
 for d in select generate_series(start_date,p_date,interval '1 day')::date loop
  perform private.assert_calendar_date(u,d);
  m:=case when d=p_date then p_minutes else 480 end;
  if m+coalesce((select sum(x.minutes) from public.time_entries x join public.timesheets t on t.id=x.timesheet_id where t.user_id=u and x.work_date=d and x.id<>e.id and x.calendar_span_id is distinct from span),0)>480 then raise exception 'Work cannot exceed 8 hours on %. Shorten this task or adjust other entries.',d; end if;
 end loop;
 for r in select * from public.time_entries where (id=e.id or calendar_span_id=span) and work_date>p_date loop
  perform public.calendar_entry_action(r.id,r.version,'delete',null);
 end loop;
 for d in select generate_series(start_date,p_date,interval '1 day')::date loop
  select * into r from public.time_entries where (id=e.id or calendar_span_id=span) and work_date=d limit 1;
  m:=case when d=p_date then p_minutes else 480 end;
  v:=public.save_calendar_entry(u,d,e.project_id,e.description,m,e.task_status,r.id,r.version);
  update public.time_entries set calendar_span_id=span,calendar_span_start=start_date where id=v;
 end loop;
 perform private.audit('calendar.resized',p_id);
end;$$;
revoke all on function public.resize_calendar_entry(uuid,integer,date,integer) from public,anon;
grant execute on function public.resize_calendar_entry(uuid,integer,date,integer) to authenticated;
-- Enforce the working-day cap across all entry write paths, not just the calendar.
create or replace function private.guard_eight_hour_workday() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 select user_id into u from public.timesheets where id=new.timesheet_id;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if new.minutes+coalesce((select sum(e.minutes) from public.time_entries e join public.timesheets t on t.id=e.timesheet_id where t.user_id=u and e.work_date=new.work_date and e.id<>new.id),0)>480 then raise exception 'Work cannot exceed 8 hours per day.';end if;
 return new;
end;$$;
revoke all on function private.guard_eight_hour_workday() from public,anon,authenticated;
create trigger guard_eight_hour_workday before insert or update of minutes,work_date,timesheet_id on public.time_entries for each row execute function private.guard_eight_hour_workday();
