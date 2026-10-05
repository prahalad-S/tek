-- Extended profiles: professional information is shared; personal information is owner/admin only.
create table public.employee_profiles(
 employee_id uuid primary key references public.employees(id) on delete cascade,
 joined_on date, employment_status text not null default 'Active', languages text[] not null default '{}',
 summary text not null default '' check(length(summary)<=8000), website text not null default '',
 updated_at timestamptz not null default now()
);
create table public.employee_experience(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,company text not null,role text not null,start_date date,end_date date,description text not null default '',check(end_date is null or start_date is null or end_date>=start_date));
create table public.employee_education(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,institution text not null,qualification text not null,start_year integer,end_year integer,check(end_year is null or start_year is null or end_year>=start_year));
create table public.employee_achievements(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,kind text not null check(kind in ('award','project','certification')),title text not null,description text not null default '',url text not null default '');
alter table public.employee_private_details add column dob date,add column gender text not null default '',add column marital_status text not null default '',add column blood_group text not null default '',add column home_number text not null default '',add column pan text not null default '',add column aadhaar text not null default '';
drop policy private_self on public.employee_private_details;
create policy private_owner_admin on public.employee_private_details for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.is_admin()));
do $$declare t text;begin foreach t in array array['employee_profiles','employee_experience','employee_education','employee_achievements'] loop execute format('alter table public.%I enable row level security',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy member_read on public.%I for select to authenticated using(private.is_member())',t);end loop;end$$;
create function public.save_extended_profile(p_employee uuid,p_profile jsonb,p_experience jsonb,p_education jsonb,p_achievements jsonb,p_skills text[],p_private jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;r jsonb;skill text;sid uuid;begin
 perform private.assert_member();select * into e from public.employees where id=p_employee for update;
 if e.id is null or (e.user_id is distinct from auth.uid() and not private.is_admin()) then raise exception 'Profile editing is not permitted.';end if;
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
revoke all on function public.save_extended_profile(uuid,jsonb,jsonb,jsonb,jsonb,text[],jsonb) from public,anon;
grant execute on function public.save_extended_profile(uuid,jsonb,jsonb,jsonb,jsonb,text[],jsonb) to authenticated;
alter table public.employee_documents add column category text not null default 'personal' check(category in ('personal','offer_letter','resume','id_card','business_card','certificate'));
drop policy documents_read on public.employee_documents;
create policy document_visibility on public.employee_documents for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.is_admin() or category in ('resume','id_card','business_card','certificate')));
drop policy documents_read on storage.objects;
create policy document_visibility on storage.objects for select to authenticated using(bucket_id='employee-documents' and private.is_member() and ((storage.foldername(name))[1]=auth.uid()::text or private.is_admin() or exists(select 1 from public.employee_documents d where d.object_path=storage.objects.name and d.category in ('resume','id_card','business_card','certificate'))));
create function public.set_document_category(p_id uuid,p_category text) returns void language plpgsql security definer set search_path='' as $$begin perform private.assert_member();update public.employee_documents set category=p_category where id=p_id and (user_id=auth.uid() or private.is_admin());if not found then raise exception 'Document unavailable.';end if;perform private.audit('document.visibility_changed',p_id);end;$$;
revoke all on function public.set_document_category(uuid,text) from public,anon;grant execute on function public.set_document_category(uuid,text) to authenticated;
create function public.directory_locations() returns setof text language sql stable security invoker set search_path='' as $$select distinct location from public.employees where location<>'' order by location$$;
revoke all on function public.directory_locations() from public,anon;grant execute on function public.directory_locations() to authenticated;

