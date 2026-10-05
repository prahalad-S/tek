-- Administrative employee editing remains server-authorized and audited.
create function public.admin_update_employee(p_employee uuid,p_name text,p_code text,p_title text,p_department uuid,p_location text,p_bio text,p_phone text,p_address text) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;begin
 if not private.is_admin() then raise exception 'Administrator access required.';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_title,''))>120 or length(coalesce(p_location,''))>160 or length(coalesce(p_code,''))>32 or length(coalesce(p_bio,''))>2000 or length(coalesce(p_phone,''))>40 or length(coalesce(p_address,''))>2000 then raise exception 'Check profile field lengths.';end if;
 select * into e from public.employees where id=p_employee for update;
 if e.id is null then raise exception 'Employee not found.';end if;
 update public.employees set full_name=trim(p_name),employee_code=nullif(trim(p_code),''),title=trim(coalesce(p_title,'')),department_id=p_department,location=trim(coalesce(p_location,'')),bio=coalesce(p_bio,'') where id=e.id;
 if e.user_id is not null then
 update public.memberships set department_id=p_department where user_id=e.user_id;
 insert into public.employee_private_details(user_id,phone,address) values(e.user_id,coalesce(p_phone,''),coalesce(p_address,'')) on conflict(user_id) do update set phone=excluded.phone,address=excluded.address,updated_at=now();
 end if;
 perform private.audit('employee.admin_profile_updated',e.id);
end;$$;
create function public.admin_set_employee_avatar(p_employee uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;begin
 if not private.is_admin() then raise exception 'Administrator access required.';end if;
 select * into e from public.employees where id=p_employee for update;
 if e.id is null or split_part(p_path,'/',1)<>coalesce(e.user_id,e.id)::text or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path) then raise exception 'Employee avatar upload not found.';end if;
 update public.employees set avatar_path=p_path where id=e.id;
 perform private.audit('employee.admin_avatar_updated',e.id);
end;$$;
create policy admin_avatar_upload on storage.objects for insert to authenticated with check(bucket_id='avatars' and private.is_admin() and exists(select 1 from public.employees e where coalesce(e.user_id,e.id)::text=(storage.foldername(name))[1]));
create policy admin_avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and private.is_admin());
revoke all on function public.admin_update_employee(uuid,text,text,text,uuid,text,text,text,text), public.admin_set_employee_avatar(uuid,text) from public,anon;
grant execute on function public.admin_update_employee(uuid,text,text,text,uuid,text,text,text,text), public.admin_set_employee_avatar(uuid,text) to authenticated;
