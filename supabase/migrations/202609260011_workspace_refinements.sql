-- Navigation, richer projects, history preferences and reversible calendar edits.
alter table public.projects add column client_name text not null default '',add column country text not null default '',add column city text not null default '';
create function public.save_project_details(p_name text,p_description text,p_status text,p_client text,p_country text,p_city text,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid;begin
 if length(p_client)>120 or length(p_country)>120 or length(p_city)>120 then raise exception 'Project details are too long.';end if;
 v:=public.save_project(p_name,p_description,p_status,p_id);update public.projects set client_name=trim(p_client),country=trim(p_country),city=trim(p_city) where id=v;return v;end;$$;
create function public.provision_employee_at_location(p_email text,p_name text,p_title text,p_department uuid,p_location text) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid;begin if length(p_location)>160 then raise exception 'Location is too long.';end if;v:=public.provision_employee(p_email,p_name,p_title,p_department);update public.employees set location=trim(p_location) where id=v;return v;end;$$;
create table public.history_hidden(user_id uuid not null references auth.users(id) on delete cascade,timesheet_id uuid not null references public.timesheets(id) on delete cascade,primary key(user_id,timesheet_id));
alter table public.history_hidden enable row level security;
grant select on public.history_hidden to authenticated;
create policy history_owner on public.history_hidden for select to authenticated using(user_id=auth.uid() and private.is_member());
create function public.clear_history(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$begin perform private.assert_member();insert into public.history_hidden select auth.uid(),s.id from public.timesheets s where s.id=any(p_ids) and (s.user_id=auth.uid() or private.can_review(s.user_id)) on conflict do nothing;end;$$;
create or replace function private.guard_time_entry() returns trigger language plpgsql security definer set search_path='' as $$declare s public.timesheets;old_sheet public.timesheets;d date;begin
 if TG_OP<>'INSERT' then select * into old_sheet from public.timesheets where id=old.timesheet_id for update;perform private.assert_calendar_date(old_sheet.user_id,old.work_date);update public.timesheets set status='draft',reviewed_by=null,review_note=null where id=old_sheet.id and status not in ('draft','rejected');end if;
 if TG_OP<>'DELETE' then select * into s from public.timesheets where id=new.timesheet_id for update;perform private.assert_calendar_date(s.user_id,new.work_date);update public.timesheets set status='draft',reviewed_by=null,review_note=null where id=s.id and status not in ('draft','rejected');if new.work_date<s.week_start or new.work_date>s.week_start+6 then raise exception 'Date must be inside the selected week.';end if;end if;
 if TG_OP='DELETE' then return old;end if;
 perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,0));
 if coalesce((select sum(t.minutes) from public.time_entries t join public.timesheets ts on ts.id=t.timesheet_id where ts.user_id=s.user_id and t.work_date=new.work_date and t.id<>new.id),0)+new.minutes+coalesce((select sum(l.daily_minutes) from public.leave_requests l where l.user_id=s.user_id and l.status='approved' and new.work_date between l.from_date and l.to_date),0)>1440 then raise exception 'Work and approved leave cannot exceed 24 hours per day.';end if;
 return new;
end;$$;
create or replace function public.save_calendar_entry(p_user uuid,p_date date,p_project uuid,p_description text,p_minutes integer,p_status text default 'In Progress',p_id uuid default null,p_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.timesheets;prev public.time_entries;v uuid;old_sheet uuid;begin
 perform private.assert_calendar_date(p_user,p_date);perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_id is not null then select * into prev from public.time_entries where id=p_id for update;if prev.id is null or prev.version is distinct from p_version or not exists(select 1 from public.timesheets where id=prev.timesheet_id and user_id=p_user) then raise exception 'Entry changed or unavailable. Refresh and retry.';end if;old_sheet:=prev.timesheet_id;end if;
 if not exists(select 1 from public.projects where id=p_project and status='active') then raise exception 'Choose an active project.';end if;
 insert into public.timesheets(user_id,week_start) values(p_user,date_trunc('week',p_date)::date) on conflict(user_id,week_start) do nothing;
 select * into s from public.timesheets where user_id=p_user and week_start=date_trunc('week',p_date)::date for update;
 
 if coalesce((select sum(minutes) from public.time_entries where timesheet_id=s.id and work_date=p_date and (p_id is null or id<>p_id)),0)+p_minutes>1440 then raise exception 'Daily total cannot exceed 24 hours.';end if;
 if p_id is null then insert into public.time_entries(timesheet_id,work_date,project_id,description,minutes,task_status) values(s.id,p_date,p_project,trim(p_description),p_minutes,p_status) returning id into v;
 else update public.time_entries set timesheet_id=s.id,work_date=p_date,project_id=p_project,description=trim(p_description),minutes=p_minutes,task_status=p_status,version=version+1 where id=p_id returning id into v;end if;
 update public.timesheets set version=version+1 where id=s.id or id=old_sheet;perform private.audit('calendar.entry_saved',v);return v;end;$$;
create or replace function public.save_time_entry(p_sheet uuid,p_date date,p_project uuid,p_description text,p_minutes integer,p_id uuid default null,p_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.timesheets;v_id uuid;v_total integer;
begin perform private.assert_member();select * into s from public.timesheets where id=p_sheet and user_id=auth.uid() for update;
 if s.id is null then raise exception 'This timesheet cannot be edited.';end if;
 if p_date<s.week_start or p_date>s.week_start+6 then raise exception 'Date must be inside the selected week.';end if;
 if not exists(select 1 from public.projects where id=p_project and status='active') then raise exception 'Select an active project.';end if;
 select coalesce(sum(minutes),0) into v_total from public.time_entries where timesheet_id=p_sheet and work_date=p_date and (p_id is null or id<>p_id);
 if p_minutes is null or p_minutes<1 or p_minutes>1440 or v_total+p_minutes>1440 then raise exception 'A day cannot contain more than 24 hours.';end if;
 if p_id is null then insert into public.time_entries(timesheet_id,work_date,project_id,description,minutes) values(p_sheet,p_date,p_project,trim(p_description),p_minutes) returning id into v_id;
 else update public.time_entries set work_date=p_date,project_id=p_project,description=trim(p_description),minutes=p_minutes,version=version+1 where id=p_id and timesheet_id=p_sheet and version=p_version returning id into v_id;
 if v_id is null then raise exception 'Entry changed. Refresh before editing.' using errcode='40001';end if;end if;
 update public.timesheets set version=version+1,status='draft' where id=p_sheet;
 perform private.audit('time_entry.saved',v_id);return v_id;end; $$;
create or replace function public.delete_time_entry(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.timesheets;v_sheet uuid;
begin perform private.assert_member();select timesheet_id into v_sheet from public.time_entries where id=p_id;select * into s from public.timesheets where id=v_sheet and user_id=auth.uid() for update;
 if s.id is null then raise exception 'This entry cannot be removed.';end if;
 delete from public.time_entries where id=p_id and version=p_version;if not found then raise exception 'Entry changed. Refresh first.';end if;
 update public.timesheets set version=version+1 where id=s.id;perform private.audit('time_entry.deleted',p_id);end; $$;
create or replace function public.review_leave(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare r public.leave_requests;begin perform private.assert_member();select * into r from public.leave_requests where id=p_id for update;if r.id is null or r.status<>'pending' or not private.can_review(r.user_id) then raise exception 'Review is not permitted.';end if;update public.leave_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),version=version+1 where id=p_id;insert into public.notifications(user_id,title,body) values(r.user_id,case when p_approve then '😊 Leave approved' else '😔 Leave declined' end,case when p_approve then 'Your leave was approved.' else 'Your leave was declined. Contact your manager.' end);perform private.audit('leave.reviewed',p_id);end; $$;

create table private.calendar_undo(id bigint generated always as identity primary key,actor uuid not null,transaction_id bigint not null,table_name text not null,row_id uuid not null,before_row jsonb,after_row jsonb,undone boolean not null default false,created_at timestamptz not null default now());
create function private.record_calendar_undo() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and coalesce(current_setting('app.undoing',true),'')<>'yes' and (TG_TABLE_NAME='time_entries' or TG_OP<>'UPDATE' or (to_jsonb(new)-'status'-'reviewed_by'-'version') is distinct from (to_jsonb(old)-'status'-'reviewed_by'-'version')) then
 insert into private.calendar_undo(actor,transaction_id,table_name,row_id,before_row,after_row) values(auth.uid(),txid_current(),TG_TABLE_NAME,case when TG_OP='DELETE' then old.id else new.id end,case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);end if;return null;end;$$;
create trigger log_calendar_undo after insert or update or delete on public.time_entries for each row execute function private.record_calendar_undo();
create trigger log_leave_undo after insert or update or delete on public.leave_requests for each row execute function private.record_calendar_undo();
create function public.undo_calendar_change() returns void language plpgsql security definer set search_path='' as $$declare tx bigint;r private.calendar_undo;c jsonb;t public.time_entries;l public.leave_requests;begin
 perform private.assert_member();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,99));
 select transaction_id into tx from private.calendar_undo where actor=auth.uid() and not undone and created_at>now()-interval '1 day' order by id desc limit 1;
 if tx is null then raise exception 'No recent calendar change to undo.';end if;
 perform set_config('app.undoing','yes',true);
 for r in select * from private.calendar_undo where actor=auth.uid() and transaction_id=tx and not undone order by id desc for update loop
 if r.table_name='time_entries' then
 select to_jsonb(e) into c from public.time_entries e where id=r.row_id for update;
 if c is distinct from r.after_row then raise exception 'This entry has changed since your action. Refresh before undoing.';end if;
 if r.before_row is null then delete from public.time_entries where id=r.row_id;
 else t:=jsonb_populate_record(null::public.time_entries,r.before_row);
 if c is null then t.version:=t.version+1;insert into public.time_entries select t.*;
 else update public.time_entries set timesheet_id=t.timesheet_id,work_date=t.work_date,project_id=t.project_id,description=t.description,minutes=t.minutes,task_status=t.task_status,version=(c->>'version')::integer+1 where id=r.row_id;end if;end if;
 update public.timesheets set version=version+1 where id in ((r.before_row->>'timesheet_id')::uuid,(r.after_row->>'timesheet_id')::uuid);
 else
 select to_jsonb(e) into c from public.leave_requests e where id=r.row_id for update;
 if c is distinct from r.after_row then raise exception 'This leave request has changed since your action.';end if;
 if r.before_row is null then delete from public.leave_requests where id=r.row_id;
 else l:=jsonb_populate_record(null::public.leave_requests,r.before_row);
 if c is null then l.version:=l.version+1;insert into public.leave_requests select l.*;
 else update public.leave_requests set from_date=l.from_date,to_date=l.to_date,reason=l.reason,leave_type=l.leave_type,daily_minutes=l.daily_minutes,status='pending',reviewed_by=null,version=(c->>'version')::integer+1 where id=r.row_id;end if;end if;
 end if;
 if r.before_row is not null then
 if r.table_name='time_entries' then select to_jsonb(e) into c from public.time_entries e where id=r.row_id;else select to_jsonb(e) into c from public.leave_requests e where id=r.row_id;end if;
 update private.calendar_undo set after_row=c where actor=auth.uid() and row_id=r.row_id and table_name=r.table_name and id<r.id and not undone and after_row=r.before_row;
 end if;
 update private.calendar_undo set undone=true where id=r.id;
 end loop;
 perform set_config('app.undoing','no',true);perform private.audit('calendar.undo',null);end;$$;
-- Runs on application refresh and optionally on Supabase Cron. No client may select a target or cutoff.
create function private.accept_elapsed_leave() returns integer language plpgsql security definer set search_path='' as $$declare r public.leave_requests;n integer:=0;begin
 for r in select * from public.leave_requests where status='pending' and to_date<private.calendar_today() order by to_date,id for update skip locked loop
 begin
 update public.leave_requests set status='approved',reviewed_by=null,version=version+1 where id=r.id;
 insert into public.notifications(user_id,title,body) values(r.user_id,'😊 Leave automatically approved','Your leave period ended without a decision and has been automatically approved.');
 n:=n+1;
 exception when raise_exception then
 -- Conflicting totals remain pending for a human decision; do not bypass consistency checks.
 null;
 end;end loop;return n;end;$$;
create function public.process_elapsed_leave() returns integer language plpgsql security definer set search_path='' as $$begin perform private.assert_member();return private.accept_elapsed_leave();end;$$;
revoke all on function private.record_calendar_undo(),private.accept_elapsed_leave() from public,anon,authenticated;
revoke all on function public.save_project_details(text,text,text,text,text,text,uuid),public.provision_employee_at_location(text,text,text,uuid,text),public.clear_history(uuid[]),public.undo_calendar_change(),public.process_elapsed_leave() from public,anon;
grant execute on function public.save_project_details(text,text,text,text,text,text,uuid),public.provision_employee_at_location(text,text,text,uuid,text),public.clear_history(uuid[]),public.undo_calendar_change(),public.process_elapsed_leave() to authenticated;
-- Additional private document kinds remain excluded from the explicit shared-category policies.
alter table public.employee_documents drop constraint employee_documents_category_check;
alter table public.employee_documents add constraint employee_documents_category_check check(category in ('personal','offer_letter','resume','id_card','business_card','certificate','pan_card','aadhaar_card','payslip','joining_letter','relieving_letter'));
-- Supabase Cron keeps the policy running even when no one has the portal open.
do $schedule$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
 execute 'create extension if not exists pg_cron with schema pg_catalog';
 execute $job$select cron.schedule('tekzenit-elapsed-leave','5 * * * *','select private.accept_elapsed_leave()')$job$;
 end if;
end $schedule$;
-- Calendar entries carry a date, so its start in the workspace timezone defines the 48-hour boundary.
create or replace function private.assert_calendar_date(p_user uuid,p_date date) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_member();
 if p_user<>auth.uid() and not private.can_review(p_user) then raise exception 'Calendar access is not permitted.';end if;
 if p_date is null or abs(p_date-private.calendar_today())>730 then raise exception 'Choose a date within two years.';end if;
 if (p_date::timestamp at time zone 'Asia/Kolkata')<now()-interval '48 hours' and not exists(select 1 from public.memberships where user_id=auth.uid() and active and role in ('manager','admin')) and not exists(select 1 from public.calendar_access_requests where user_id=p_user and status='approved' and p_date between from_date and to_date and expires_at>now()) then raise exception 'Restricted date: older than 48 hours. Request access from your team lead.' using errcode='42501';end if;
end;$$;
create or replace function public.calendar_access() returns jsonb language plpgsql security definer set search_path='' as $$declare cutoff timestamp:=(now()-interval '48 hours') at time zone 'Asia/Kolkata';begin perform private.assert_member();return jsonb_build_object('today',private.calendar_today(),'earliest',cutoff::date+case when cutoff::time='00:00:00'::time then 0 else 1 end,'timezone','Asia/Kolkata','grants',coalesce((select jsonb_agg(jsonb_build_object('from_date',from_date,'to_date',to_date)) from public.calendar_access_requests where user_id=auth.uid() and status='approved' and expires_at>now()),'[]'));end;$$;
