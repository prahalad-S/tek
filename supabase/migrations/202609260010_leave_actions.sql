-- Prevent date moves and leave duplication from bypassing the historical-edit boundary.
create or replace function private.guard_leave() returns trigger language plpgsql security definer set search_path='' as $$declare d date;begin
 if TG_OP='DELETE' or (TG_OP='UPDATE' and (new.from_date<>old.from_date or new.to_date<>old.to_date or new.reason<>old.reason or new.daily_minutes<>old.daily_minutes or new.leave_type<>old.leave_type)) then
 for d in select generate_series(old.from_date,old.to_date,interval '1 day')::date loop perform private.assert_calendar_date(old.user_id,d);end loop;
 if old.status='approved' then raise exception 'Approved leave cannot be changed or deleted.';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;
 if TG_OP='INSERT' or new.from_date<>old.from_date or new.to_date<>old.to_date or new.reason<>old.reason or new.daily_minutes<>old.daily_minutes or new.leave_type<>old.leave_type then
 if new.to_date-new.from_date>90 then raise exception 'Request up to 90 days.';end if;
 for d in select generate_series(new.from_date,new.to_date,interval '1 day')::date loop perform private.assert_calendar_date(new.user_id,d);end loop;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if new.status<>'rejected' then
 for d in select generate_series(new.from_date,new.to_date,interval '1 day')::date loop
 if coalesce((select sum(daily_minutes) from public.leave_requests where user_id=new.user_id and id<>new.id and status<>'rejected' and d between from_date and to_date),0)+new.daily_minutes>480 then raise exception 'Leave requests overlap beyond a full day.';end if;
 if new.status='approved' and coalesce((select sum(t.minutes) from public.time_entries t join public.timesheets s on s.id=t.timesheet_id where s.user_id=new.user_id and t.work_date=d),0)+new.daily_minutes+coalesce((select sum(l.daily_minutes) from public.leave_requests l where l.user_id=new.user_id and l.id<>new.id and l.status='approved' and d between l.from_date and l.to_date),0)>1440 then raise exception 'Work and approved leave cannot exceed 24 hours per day.';end if;
 end loop;end if;return new;end;$$;
create function public.calendar_leave_action(p_id uuid,p_version integer,p_action text,p_date date) returns void language plpgsql security definer set search_path='' as $$declare r public.leave_requests;begin
 perform private.assert_member();select * into r from public.leave_requests where id=p_id for update;if r.id is null or r.version is distinct from p_version or r.status='approved' then raise exception 'Leave changed or already approved.';end if;perform private.assert_calendar_date(r.user_id,r.from_date);
 if p_action='move' then perform public.save_calendar_leave(r.user_id,p_date,p_date+(r.to_date-r.from_date),r.reason,r.leave_type,r.daily_minutes,r.id,r.version);
 elsif p_action='copy' then perform public.save_calendar_leave(r.user_id,p_date,p_date+(r.to_date-r.from_date),r.reason,r.leave_type,r.daily_minutes);
 elsif p_action='extend' then if p_date<=r.to_date then raise exception 'Choose an end date after the current leave period.';end if;perform public.save_calendar_leave(r.user_id,r.from_date,p_date,r.reason,r.leave_type,r.daily_minutes,r.id,r.version);
 else raise exception 'Unknown leave action.';end if;end;$$;
revoke all on function public.calendar_leave_action(uuid,integer,text,date) from public,anon;
grant execute on function public.calendar_leave_action(uuid,integer,text,date) to authenticated;
