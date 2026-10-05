-- Employee-owned private details and map pins exist before account activation.
do $$ declare t text;begin foreach t in array array['employee_private_details','employee_map_locations'] loop
 execute format('alter table public.%I add column employee_id uuid references public.employees(id) on delete cascade',t);
 execute format('update public.%I d set employee_id=e.id from public.employees e where e.user_id=d.user_id',t);
 execute format('alter table public.%I drop constraint %I',t,t||'_pkey');
 execute format('alter table public.%I alter column user_id drop not null,add unique(user_id),add primary key(employee_id)',t);
 end loop;end;$$;
create function private.resolve_profile_employee() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.employee_id is null then select id into new.employee_id from public.employees where user_id=new.user_id;end if;
 select user_id into new.user_id from public.employees where id=new.employee_id;
 return new;end;$$;
create trigger details_employee before insert or update on public.employee_private_details for each row execute function private.resolve_profile_employee();
create trigger pin_employee before insert or update on public.employee_map_locations for each row execute function private.resolve_profile_employee();
create function private.link_employee_details() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.user_id is distinct from old.user_id then
 update public.employee_private_details set user_id=new.user_id where employee_id=new.id;
 update public.employee_map_locations set user_id=new.user_id where employee_id=new.id;
 end if;return new;end;$$;
create trigger employee_details_claimed after update of user_id on public.employees for each row execute function private.link_employee_details();
create or replace function private.invalidate_map_pin() returns trigger language plpgsql security definer set search_path='' as $$begin if new.address is distinct from old.address then delete from public.employee_map_locations where employee_id=new.employee_id;end if;return new;end;$$;
create policy pending_details_editor on public.employee_private_details for select to authenticated using(private.can_manage_profile(employee_id));
create policy editor_map_read on public.employee_map_locations for select to authenticated using(private.can_manage_profile(employee_id));
revoke all on function private.resolve_profile_employee(),private.link_employee_details() from public,anon,authenticated;
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
 end if;
 insert into public.employee_private_details(employee_id,user_id,phone,address) values(e.id,e.user_id,coalesce(p_phone,''),coalesce(p_address,'')) on conflict(employee_id) do update set phone=excluded.phone,address=excluded.address,updated_at=now();
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
 if p_private is not null then
 insert into public.employee_private_details(employee_id,user_id) values(e.id,e.user_id) on conflict(employee_id) do nothing;
 update public.employee_private_details set dob=nullif(p_private->>'dob','')::date,gender=left(coalesce(p_private->>'gender',''),80),marital_status=left(coalesce(p_private->>'marital_status',''),80),blood_group=left(coalesce(p_private->>'blood_group',''),20),home_number=left(coalesce(p_private->>'home_number',''),40),pan=left(coalesce(p_private->>'pan',''),30),aadhaar=left(coalesce(p_private->>'aadhaar',''),30),updated_at=now() where employee_id=e.id;
 end if;perform private.audit('profile.extended_updated',e.id);
end;$$;

create function public.save_employee_map(p_employee uuid,p_lat double precision,p_lon double precision,p_address text,p_shared boolean,p_locations text[],p_users uuid[]) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.can_manage_profile(p_employee) then raise exception 'Profile editing is not permitted.';end if;
 if length(trim(p_address))<3 or not exists(select 1 from public.employee_private_details where employee_id=p_employee and address=p_address) then raise exception 'Save this employee address first.';end if;
 if cardinality(p_locations)>200 or cardinality(p_users)>1000 then raise exception 'Too many recipients.';end if;
 if p_shared and coalesce(cardinality(p_locations),0)+coalesce(cardinality(p_users),0)=0 then raise exception 'Choose a location or person to share with.';end if;
 if exists(select 1 from unnest(p_users) u where not exists(select 1 from public.memberships m where m.user_id=u and m.active)) then raise exception 'Choose active workspace members.';end if;
 if exists(select 1 from unnest(p_locations) l where not exists(select 1 from public.employees e where e.location=l)) then raise exception 'Choose an existing location.';end if;
 insert into public.employee_map_locations(employee_id,latitude,longitude,shared,shared_locations,shared_users) values(p_employee,p_lat,p_lon,p_shared,case when p_shared then coalesce(p_locations,'{}') else '{}' end,case when p_shared then coalesce(p_users,'{}') else '{}' end) on conflict(employee_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,shared=excluded.shared,shared_locations=excluded.shared_locations,shared_users=excluded.shared_users,updated_at=now();
 perform private.audit('employee.map_updated',p_employee);end;$$;
revoke all on function public.save_employee_map(uuid,double precision,double precision,text,boolean,text[],uuid[]) from public,anon;
grant execute on function public.save_employee_map(uuid,double precision,double precision,text,boolean,text[],uuid[]) to authenticated;
