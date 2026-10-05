create table public.profile_editor_scopes(employee_id uuid references public.employees(id) on delete cascade,location text not null check(length(trim(location))>0),primary key(employee_id,location));
alter table public.profile_editor_scopes enable row level security;
grant select on public.profile_editor_scopes to authenticated;
create policy scopes_read on public.profile_editor_scopes for select to authenticated using(private.is_member() and (private.is_admin() or employee_id in(select id from public.employees where user_id=auth.uid())));
create function private.can_manage_profile(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_member() and (private.is_admin() or exists(select 1 from public.employees target join public.profile_editor_scopes scope on lower(trim(scope.location))=lower(trim(target.location)) join public.employees editor on editor.id=scope.employee_id where target.id=p_employee and editor.user_id=auth.uid()))$$;
create function private.can_manage_profile_user(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.employees where user_id=p_user and private.can_manage_profile(id))$$;
revoke all on function private.can_manage_profile(uuid),private.can_manage_profile_user(uuid) from public,anon;
grant execute on function private.can_manage_profile(uuid),private.can_manage_profile_user(uuid) to authenticated;
create policy private_scoped_editor on public.employee_private_details for select to authenticated using(private.can_manage_profile_user(user_id));
create policy documents_scoped_editor on public.employee_documents for select to authenticated using(private.can_manage_profile_user(user_id));
create policy scoped_storage_read on storage.objects for select to authenticated using(bucket_id='employee-documents' and exists(select 1 from public.employees e where e.user_id::text=(storage.foldername(name))[1] and private.can_manage_profile(e.id)));
create policy scoped_storage_upload on storage.objects for insert to authenticated with check(bucket_id in ('avatars','employee-documents') and exists(select 1 from public.employees e where coalesce(e.user_id,e.id)::text=(storage.foldername(name))[1] and private.can_manage_profile(e.id)));
create policy scoped_storage_delete on storage.objects for delete to authenticated using(bucket_id in ('avatars','employee-documents') and exists(select 1 from public.employees e where coalesce(e.user_id,e.id)::text=(storage.foldername(name))[1] and private.can_manage_profile(e.id)));
-- Administrative employee editing remains server-authorized and audited.
create or replace function public.admin_update_employee(p_employee uuid,p_name text,p_code text,p_title text,p_department uuid,p_location text,p_bio text,p_phone text,p_address text) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;begin
 if not private.can_manage_profile(p_employee) then raise exception 'Administrator access required.';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_title,''))>120 or length(coalesce(p_location,''))>160 or length(coalesce(p_code,''))>32 or length(coalesce(p_bio,''))>2000 or length(coalesce(p_phone,''))>40 or length(coalesce(p_address,''))>2000 then raise exception 'Check profile field lengths.';end if;
 select * into e from public.employees where id=p_employee for update;
 if e.id is null then raise exception 'Employee not found.';end if;
 if not private.is_admin() and (p_department is distinct from e.department_id or lower(trim(coalesce(p_location,'')))<>lower(trim(e.location))) then raise exception 'Only administrators can change employee department or location.';end if;
 update public.employees set full_name=trim(p_name),employee_code=nullif(trim(p_code),''),title=trim(coalesce(p_title,'')),department_id=p_department,location=trim(coalesce(p_location,'')),bio=coalesce(p_bio,'') where id=e.id;
 if e.user_id is not null then
 update public.memberships set department_id=p_department where user_id=e.user_id;
 insert into public.employee_private_details(user_id,phone,address) values(e.user_id,coalesce(p_phone,''),coalesce(p_address,'')) on conflict(user_id) do update set phone=excluded.phone,address=excluded.address,updated_at=now();
 end if;
 perform private.audit('employee.admin_profile_updated',e.id);
end;$$;
create or replace function public.admin_set_employee_avatar(p_employee uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;begin
 if not private.can_manage_profile(p_employee) then raise exception 'Administrator access required.';end if;
 select * into e from public.employees where id=p_employee for update;
 if e.id is null or split_part(p_path,'/',1)<>coalesce(e.user_id,e.id)::text or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path) then raise exception 'Employee avatar upload not found.';end if;
 update public.employees set avatar_path=p_path where id=e.id;
 perform private.audit('employee.admin_avatar_updated',e.id);
end;$$;
create or replace function public.save_extended_profile(p_employee uuid,p_profile jsonb,p_experience jsonb,p_education jsonb,p_achievements jsonb,p_skills text[],p_private jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;r jsonb;skill text;sid uuid;begin
 perform private.assert_member();select * into e from public.employees where id=p_employee for update;
 if e.id is null or (e.user_id is distinct from auth.uid() and not private.can_manage_profile(p_employee)) then raise exception 'Profile editing is not permitted.';end if;
 if pg_column_size(p_profile)+pg_column_size(p_experience)+pg_column_size(p_education)+pg_column_size(p_achievements)+coalesce(pg_column_size(p_private),0)>100000 then raise exception 'Profile is too large.';end if;
 if jsonb_array_length(p_experience)>30 or jsonb_array_length(p_education)>20 or jsonb_array_length(p_achievements)>50 or cardinality(p_skills)>100 then raise exception 'Too many profile items.';end if;
 insert into public.employee_profiles(employee_id,joined_on,employment_status,languages,summary,website) values(e.id,nullif(p_profile->>'joined_on','')::date,left(coalesce(p_profile->>'employment_status','Active'),80),array(select jsonb_array_elements_text(coalesce(p_profile->'languages','[]'))),coalesce(p_profile->>'summary',''),left(coalesce(p_profile->>'website',''),500)) on conflict(employee_id) do update set joined_on=excluded.joined_on,employment_status=excluded.employment_status,languages=excluded.languages,summary=excluded.summary,website=excluded.website,updated_at=now();
 delete from public.employee_experience where employee_id=e.id;
 for r in select * from jsonb_array_elements(p_experience) loop
 if length(trim(r->>'company'))=0 or length(trim(r->>'role'))=0 then raise exception 'Company and role are required.';end if;
 insert into public.employee_experience(employee_id,company,role,start_date,end_date,description) values(e.id,left(r->>'company',160),left(r->>'role',160),nullif(r->>'start_date','')::date,nullif(r->>'end_date','')::date,left(coalesce(r->>'description',''),5000));end loop;
 delete from public.employee_education where employee_id=e.id;
 for r in select * from jsonb_array_elements(p_education) loop insert into public.employee_education(employee_id,institution,qualification,start_year,end_year) values(e.id,left(r->>'institution',200),left(r->>'qualification',200),nullif(r->>'start_year','')::int,nullif(r->>'end_year','')::int);end loop;
 delete from public.employee_achievements where employee_id=e.id;
 for r in select * from jsonb_array_elements(p_achievements) loop insert into public.employee_achievements(employee_id,kind,title,description,url) values(e.id,r->>'kind',left(r->>'title',200),left(coalesce(r->>'description',''),5000),left(coalesce(r->>'url',''),500));end loop;
 delete from public.employee_skills where employee_id=e.id;
 foreach skill in array coalesce(p_skills,'{}') loop skill:=trim(skill);if length(skill)>0 then insert into public.skills(name) values(left(skill,80)) on conflict(name) do update set name=excluded.name returning id into sid;insert into public.employee_skills values(e.id,sid) on conflict do nothing;end if;end loop;
 if p_private is not null and e.user_id is not null then
 insert into public.employee_private_details(user_id) values(e.user_id) on conflict do nothing;
 update public.employee_private_details set dob=nullif(p_private->>'dob','')::date,gender=left(coalesce(p_private->>'gender',''),80),marital_status=left(coalesce(p_private->>'marital_status',''),80),blood_group=left(coalesce(p_private->>'blood_group',''),20),home_number=left(coalesce(p_private->>'home_number',''),40),pan=left(coalesce(p_private->>'pan',''),30),aadhaar=left(coalesce(p_private->>'aadhaar',''),30),updated_at=now() where user_id=e.user_id;
 end if;perform private.audit('profile.extended_updated',e.id);
end;$$;
create or replace function public.register_profile_document(p_user uuid,p_name text,p_path text,p_mime text,p_size bigint,p_category text) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid;begin
 perform private.assert_member();if p_user<>auth.uid() and not private.can_manage_profile_user(p_user) then raise exception 'File upload is not permitted.';end if;
 if not exists(select 1 from public.employees where user_id=p_user) or split_part(p_path,'/',1)<>p_user::text or not exists(select 1 from storage.objects where bucket_id='employee-documents' and name=p_path) then raise exception 'Upload not found.';end if;
 if length(p_name) not between 1 and 255 or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'Unsupported document.';end if;
 insert into public.employee_documents(user_id,name,object_path,mime_type,size_bytes,category) values(p_user,p_name,p_path,p_mime,p_size,p_category) returning id into v;perform private.audit('profile.document_uploaded',v);return v;end;$$;
create or replace function public.delete_profile_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin perform private.assert_member();delete from public.employee_documents where id=p_id and (user_id=auth.uid() or private.can_manage_profile_user(user_id));if not found then raise exception 'Document not found.';end if;perform private.audit('profile.document_deleted',p_id);end;$$;

alter table public.employees add column archived_at timestamptz,add column departure_status text check(departure_status in ('Left','Terminated'));
create function public.archive_employee(p_employee uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$declare e public.employees;begin
 if not private.is_admin() then raise exception 'Administrator access required.';end if;
 if p_status not in ('Left','Terminated') or p_status is null then raise exception 'Select Left or Terminated.';end if;
 select * into e from public.employees where id=p_employee for update;
 if e.id is null or e.user_id=auth.uid() then raise exception 'Select another employee.';end if;
 if exists(select 1 from public.memberships where user_id=e.user_id and role='admin') then raise exception 'Change this administrator to an employee before removing access.';end if;
 update public.employees set archived_at=now(),departure_status=p_status where id=e.id;
 update public.memberships set active=false where user_id=e.user_id;
 update private.allowed_emails set enabled=false where email=e.email;
 insert into public.employee_profiles(employee_id,employment_status) values(e.id,p_status) on conflict(employee_id) do update set employment_status=p_status;
 perform private.audit('employee.archived',e.id);
end;$$;
revoke all on function public.archive_employee(uuid,text) from public,anon;
grant execute on function public.archive_employee(uuid,text) to authenticated;
