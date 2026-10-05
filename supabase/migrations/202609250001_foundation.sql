-- tekenit: one organization, email identity, no OTP or legacy API.
create schema if not exists private;
revoke all on schema private from public;
create table public.departments(id uuid primary key default gen_random_uuid(), name text not null unique);
create table public.employees(
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete set null,
 email text not null unique check(email=lower(email)), full_name text not null check(length(full_name) between 1 and 120),
 employee_code text unique check(employee_code is null or length(employee_code) between 1 and 32),
 title text not null default '', department_id uuid references public.departments(id), location text not null default '',
 bio text not null default '' check(length(bio)<=2000), avatar_path text, created_at timestamptz not null default now()
);
create table public.memberships(user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'employee' check(role in ('employee','manager','admin')), active boolean not null default true,
 department_id uuid references public.departments(id));
create table private.allowed_emails(email text primary key check(email=lower(email)), enabled boolean not null default true);
create table public.employee_private_details(user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null default '', address text not null default '', updated_at timestamptz not null default now());
create table public.skills(id uuid primary key default gen_random_uuid(), name text not null unique);
create table public.employee_skills(employee_id uuid references public.employees(id) on delete cascade, skill_id uuid references public.skills(id), primary key(employee_id,skill_id));
create table public.projects(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 description text not null default '' check(length(description)<=4000), status text not null default 'active' check(status in ('active','paused','completed')),
 color text not null default '#7861dc' check(color ~ '^#[0-9A-Fa-f]{6}$'), created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.project_memberships(project_id uuid references public.projects(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,primary key(project_id,user_id));
create table public.timesheets(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 week_start date not null check(extract(isodow from week_start)=1),status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')),
 version integer not null default 1,submitted_at timestamptz,reviewed_by uuid references auth.users(id),review_note text,unique(user_id,week_start));
create table public.time_entries(id uuid primary key default gen_random_uuid(),timesheet_id uuid not null references public.timesheets(id) on delete cascade,
 work_date date not null,project_id uuid not null references public.projects(id),description text not null check(length(trim(description)) between 1 and 2000),
 minutes integer not null check(minutes between 1 and 1440),version integer not null default 1);
create index on public.time_entries(timesheet_id,work_date);
create index on public.employees(department_id,full_name);
create table public.timesheet_revisions(id uuid primary key default gen_random_uuid(),timesheet_id uuid references public.timesheets(id),version integer not null,payload jsonb not null,created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),title text not null,body text not null,read_at timestamptz,created_at timestamptz not null default now());
create index on public.notifications(user_id,created_at desc);
create table public.employee_documents(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),name text not null,object_path text not null unique,mime_type text not null,size_bytes bigint not null check(size_bytes between 1 and 10485760),created_at timestamptz not null default now());
create table public.leave_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),from_date date not null,to_date date not null check(to_date>=from_date),reason text not null check(length(reason) between 1 and 2000),status text not null default 'pending' check(status in ('pending','approved','rejected')),reviewed_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.events(id uuid primary key default gen_random_uuid(),name text not null,starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>=starts_at),description text not null default '');
create table public.holidays(id uuid primary key default gen_random_uuid(),name text not null,day date not null unique);
create table public.audit_events(id uuid primary key default gen_random_uuid(),actor uuid,action text not null,target_id uuid,created_at timestamptz not null default now());
create table public.agent_actions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),kind text not null check(kind='draft_time_entry'),payload jsonb not null,status text not null default 'proposed' check(status in ('proposed','executed','cancelled')),expires_at timestamptz not null default now()+interval '10 minutes',created_at timestamptz not null default now(),result_id uuid);
create table public.agent_usage(user_id uuid references auth.users(id),day date,requests integer not null,primary key(user_id,day));

create function private.is_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where user_id=auth.uid() and active); $$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where user_id=auth.uid() and active and role='admin'); $$;
create function private.can_review(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid()<>target and exists(select 1 from public.memberships me join public.memberships them on them.user_id=target where me.user_id=auth.uid() and me.active and them.active and (me.role='admin' or (me.role='manager' and me.department_id=them.department_id)));
$$;
create function private.assert_member() returns void language plpgsql security definer set search_path='' as $$ begin if not private.is_member() then raise exception 'Workspace access is not available.' using errcode='42501';end if;end; $$;
create function private.audit(p_action text,p_target uuid) returns void language sql security definer set search_path='' as $$ insert into public.audit_events(actor,action,target_id) values(auth.uid(),p_action,p_target); $$;

-- Linking requires a confirmed Auth email on the administrator-controlled allowlist.
create function public.claim_profile() returns uuid language plpgsql security definer set search_path='' as $$
declare v_email text; v_id uuid;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null or not exists(select 1 from private.allowed_emails where email=v_email and enabled) then raise exception 'Your verified work email has not been provisioned. Contact your administrator.' using errcode='42501';end if;
 if exists(select 1 from public.memberships where user_id=auth.uid() and not active) then raise exception 'Account disabled.' using errcode='42501';end if;
 update public.employees set user_id=auth.uid() where email=v_email and (user_id is null or user_id=auth.uid()) returning id into v_id;
 if v_id is null then raise exception 'Employee profile is unavailable.';end if;
 insert into public.memberships(user_id,department_id) select auth.uid(),department_id from public.employees where id=v_id on conflict(user_id) do nothing;
 return v_id;
end; $$;
create function public.update_my_profile(p_name text,p_code text,p_location text,p_bio text,p_phone text,p_address text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.assert_member();
 if length(p_phone)>40 or length(p_address)>1000 or length(p_location)>160 then raise exception 'Profile field is too long.';end if;
 update public.employees set full_name=trim(p_name),employee_code=nullif(trim(p_code),''),location=trim(p_location),bio=p_bio where user_id=auth.uid();
 insert into public.employee_private_details(user_id,phone,address) values(auth.uid(),p_phone,p_address) on conflict(user_id) do update set phone=excluded.phone,address=excluded.address,updated_at=now();
 perform private.audit('profile.updated',auth.uid());end; $$;
create function public.get_or_create_timesheet(p_week date) returns public.timesheets language plpgsql security definer set search_path='' as $$
declare s public.timesheets;
begin perform private.assert_member();if abs(p_week-current_date)>730 then raise exception 'Week is outside the supported range.';end if;
 insert into public.timesheets(user_id,week_start) values(auth.uid(),p_week) on conflict(user_id,week_start) do nothing;
 select * into s from public.timesheets where user_id=auth.uid() and week_start=p_week;return s;end; $$;
create function public.save_time_entry(p_sheet uuid,p_date date,p_project uuid,p_description text,p_minutes integer,p_id uuid default null,p_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.timesheets;v_id uuid;v_total integer;
begin perform private.assert_member();select * into s from public.timesheets where id=p_sheet and user_id=auth.uid() for update;
 if s.id is null or s.status not in ('draft','rejected') then raise exception 'This timesheet cannot be edited.';end if;
 if p_date<s.week_start or p_date>s.week_start+6 then raise exception 'Date must be inside the selected week.';end if;
 if not exists(select 1 from public.projects where id=p_project and status='active') then raise exception 'Select an active project.';end if;
 select coalesce(sum(minutes),0) into v_total from public.time_entries where timesheet_id=p_sheet and work_date=p_date and (p_id is null or id<>p_id);
 if p_minutes is null or p_minutes<1 or p_minutes>1440 or v_total+p_minutes>1440 then raise exception 'A day cannot contain more than 24 hours.';end if;
 if p_id is null then insert into public.time_entries(timesheet_id,work_date,project_id,description,minutes) values(p_sheet,p_date,p_project,trim(p_description),p_minutes) returning id into v_id;
 else update public.time_entries set work_date=p_date,project_id=p_project,description=trim(p_description),minutes=p_minutes,version=version+1 where id=p_id and timesheet_id=p_sheet and version=p_version returning id into v_id;
 if v_id is null then raise exception 'Entry changed. Refresh before editing.' using errcode='40001';end if;end if;
 update public.timesheets set version=version+1,status='draft' where id=p_sheet;
 perform private.audit('time_entry.saved',v_id);return v_id;end; $$;
create function public.delete_time_entry(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.timesheets;v_sheet uuid;
begin perform private.assert_member();select timesheet_id into v_sheet from public.time_entries where id=p_id;select * into s from public.timesheets where id=v_sheet and user_id=auth.uid() for update;
 if s.id is null or s.status not in ('draft','rejected') then raise exception 'This entry cannot be removed.';end if;
 delete from public.time_entries where id=p_id and version=p_version;if not found then raise exception 'Entry changed. Refresh first.';end if;
 update public.timesheets set version=version+1 where id=s.id;perform private.audit('time_entry.deleted',p_id);end; $$;
create function public.submit_timesheet(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.timesheets;
begin perform private.assert_member();select * into s from public.timesheets where id=p_id and user_id=auth.uid() for update;
 if s.id is null or s.status not in ('draft','rejected') or s.version<>p_version then raise exception 'Timesheet changed or cannot be submitted.';end if;
 if not exists(select 1 from public.time_entries where timesheet_id=p_id) then raise exception 'Add at least one entry before submitting.';end if;
 insert into public.timesheet_revisions(timesheet_id,version,payload) select p_id,s.version,jsonb_agg(to_jsonb(t)) from public.time_entries t where timesheet_id=p_id;
 update public.timesheets set status='submitted',submitted_at=now(),version=version+1,review_note=null where id=p_id;
 insert into public.notifications(user_id,title,body) select m.user_id,'Timesheet ready for review','A team member submitted their weekly timesheet.' from public.memberships m join public.memberships owner on owner.user_id=auth.uid() where m.active and m.user_id<>auth.uid() and (m.role='admin' or (m.role='manager' and m.department_id=owner.department_id));
 perform private.audit('timesheet.submitted',p_id);end; $$;
create function public.review_timesheet(p_id uuid,p_version integer,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare s public.timesheets;
begin perform private.assert_member();select * into s from public.timesheets where id=p_id for update;
 if s.id is null or not private.can_review(s.user_id) or s.status<>'submitted' or s.version<>p_version then raise exception 'Review not permitted or timesheet changed.';end if;
 if not p_approve and length(trim(p_note))=0 then raise exception 'Add a reason for requesting changes.';end if;
 update public.timesheets set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_note=left(p_note,2000),version=version+1 where id=p_id;
 insert into public.notifications(user_id,title,body) values(s.user_id,case when p_approve then 'Timesheet approved' else 'Timesheet needs changes' end,left(p_note,2000));
 perform private.audit('timesheet.reviewed',p_id);end; $$;
create function public.save_project(p_name text,p_description text,p_status text,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;begin perform private.assert_member();if not exists(select 1 from public.memberships where user_id=auth.uid() and role in ('admin','manager')) then raise exception 'Project management access required.';end if;
 if p_id is null then insert into public.projects(name,description,status,created_by) values(trim(p_name),p_description,p_status,auth.uid()) returning id into v_id;
 else update public.projects set name=trim(p_name),description=p_description,status=p_status where id=p_id returning id into v_id;if v_id is null then raise exception 'Project not found.';end if;end if;
 perform private.audit('project.saved',v_id);return v_id;end; $$;
create function public.mark_notifications_read() returns void language plpgsql security definer set search_path='' as $$ begin perform private.assert_member();update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;end; $$;
create function public.set_my_avatar(p_path text) returns void language plpgsql security definer set search_path='' as $$ begin perform private.assert_member();if split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path) then raise exception 'Upload not found.';end if;update public.employees set avatar_path=p_path where user_id=auth.uid();end; $$;
create function public.register_document(p_name text,p_path text,p_mime text,p_size bigint) returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin perform private.assert_member();if split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='employee-documents' and name=p_path) then raise exception 'Upload not found.';end if;if length(p_name)>255 or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp') then raise exception 'Unsupported document.';end if;insert into public.employee_documents(user_id,name,object_path,mime_type,size_bytes) values(auth.uid(),p_name,p_path,p_mime,p_size) returning id into v_id;perform private.audit('document.uploaded',v_id);return v_id;end; $$;
create function public.delete_document_record(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform private.assert_member();delete from public.employee_documents where id=p_id and user_id=auth.uid();if not found then raise exception 'Document not found.';end if;perform private.audit('document.deleted',p_id);end; $$;
create function public.request_leave(p_from date,p_to date,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin perform private.assert_member();if p_to-p_from>90 then raise exception 'Request up to 90 days at a time.';end if;insert into public.leave_requests(user_id,from_date,to_date,reason) values(auth.uid(),p_from,p_to,trim(p_reason)) returning id into v_id;perform private.audit('leave.requested',v_id);return v_id;end; $$;
create function public.review_leave(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare r public.leave_requests;begin perform private.assert_member();select * into r from public.leave_requests where id=p_id for update;if r.id is null or r.status<>'pending' or not private.can_review(r.user_id) then raise exception 'Review is not permitted.';end if;update public.leave_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid() where id=p_id;insert into public.notifications(user_id,title,body) values(r.user_id,'Leave request reviewed',case when p_approve then 'Your leave was approved.' else 'Your leave was declined. Contact your manager.' end);perform private.audit('leave.reviewed',p_id);end; $$;

-- AI proposals never bypass the same domain commands used by the application.
create function public.reserve_agent_request() returns void language plpgsql security definer set search_path='' as $$ declare n integer;begin perform private.assert_member();insert into public.agent_usage(user_id,day,requests) values(auth.uid(),current_date,1) on conflict(user_id,day) do update set requests=public.agent_usage.requests+1 returning requests into n;if n>30 then raise exception 'Daily assistant limit reached.';end if;end; $$;
create function public.propose_agent_entry(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin perform private.assert_member();if pg_column_size(p_payload)>8000 then raise exception 'Proposal too large.';end if;insert into public.agent_actions(user_id,kind,payload) values(auth.uid(),'draft_time_entry',p_payload) returning id into v_id;return v_id;end; $$;
create function public.confirm_agent_action(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$ declare a public.agent_actions;v_id uuid;begin perform private.assert_member();select * into a from public.agent_actions where id=p_id and user_id=auth.uid() for update;if a.id is null then raise exception 'Action not found.';end if;if a.status='executed' then return a.result_id;end if;if a.status<>'proposed' or a.expires_at<now() then raise exception 'Proposal expired or cancelled. Prepare a new one.';end if;
 v_id:=public.save_time_entry((a.payload->>'sheet_id')::uuid,(a.payload->>'date')::date,(a.payload->>'project_id')::uuid,a.payload->>'description',(a.payload->>'minutes')::integer);
 update public.agent_actions set status='executed',result_id=v_id where id=p_id;perform private.audit('assistant.action_confirmed',p_id);return v_id;end; $$;
create function public.cancel_agent_action(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform private.assert_member();update public.agent_actions set status='cancelled' where id=p_id and user_id=auth.uid() and status='proposed';end; $$;

-- All business mutations use narrowly defined functions. No generic write endpoint.
grant usage on schema public, private to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke insert,update,delete on all tables in schema public from authenticated;
revoke all on all tables in schema private from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(),private.is_admin(),private.can_review(uuid) to authenticated;
do $$ declare t text;begin foreach t in array array['departments','employees','memberships','employee_private_details','skills','employee_skills','projects','project_memberships','timesheets','time_entries','timesheet_revisions','notifications','employee_documents','leave_requests','events','holidays','audit_events','agent_actions','agent_usage'] loop execute format('alter table public.%I enable row level security',t);end loop;end $$;
create policy directory on public.employees for select to authenticated using(private.is_member());
create policy departments_read on public.departments for select to authenticated using(private.is_member());
create policy memberships_self on public.memberships for select to authenticated using(user_id=auth.uid());
create policy private_self on public.employee_private_details for select to authenticated using(user_id=auth.uid() and private.is_member());
create policy skills_read on public.skills for select to authenticated using(private.is_member());
create policy employee_skills_read on public.employee_skills for select to authenticated using(private.is_member());
create policy projects_read on public.projects for select to authenticated using(private.is_member());
create policy project_members_read on public.project_memberships for select to authenticated using(private.is_member());
create policy sheets_read on public.timesheets for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.can_review(user_id)));
create policy entries_read on public.time_entries for select to authenticated using(exists(select 1 from public.timesheets s where s.id=timesheet_id));
create policy revisions_read on public.timesheet_revisions for select to authenticated using(exists(select 1 from public.timesheets s where s.id=timesheet_id));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and private.is_member());
create policy documents_read on public.employee_documents for select to authenticated using(user_id=auth.uid() and private.is_member());
create policy leave_read on public.leave_requests for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.can_review(user_id)));
create policy events_read on public.events for select to authenticated using(private.is_member());
create policy holidays_read on public.holidays for select to authenticated using(private.is_member());
create policy audit_admin on public.audit_events for select to authenticated using(private.is_admin());
create policy actions_self on public.agent_actions for select to authenticated using(user_id=auth.uid() and private.is_member());
-- agent_usage intentionally has no client SELECT policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp']),
 ('employee-documents','employee-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and private.is_member());
create policy documents_read on storage.objects for select to authenticated using(bucket_id='employee-documents' and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy owned_upload on storage.objects for insert to authenticated with check(bucket_id in ('avatars','employee-documents') and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy owned_delete on storage.objects for delete to authenticated using(bucket_id in ('avatars','employee-documents') and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
