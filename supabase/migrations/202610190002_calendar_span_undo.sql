-- Requires 202610190001. Restore span identity for every undo step.
create or replace function public.undo_calendar_change() returns void language plpgsql security definer set search_path='' as $$declare tx bigint;r private.calendar_undo;c jsonb;t public.time_entries;l public.leave_requests;begin
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
 else update public.time_entries set timesheet_id=t.timesheet_id,work_date=t.work_date,project_id=t.project_id,description=t.description,minutes=t.minutes,task_status=t.task_status,calendar_span_id=t.calendar_span_id,calendar_span_start=t.calendar_span_start,version=(c->>'version')::integer+1 where id=r.row_id;end if;end if;
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