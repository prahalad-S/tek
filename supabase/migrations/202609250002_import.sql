create table private.pending_profile_details(email text primary key,phone text not null default '',address text not null default '');
revoke all on private.pending_profile_details from public,anon,authenticated;
grant all on all tables in schema public to service_role;
create function public.provision_imported_emails(p_details jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 if jsonb_typeof(p_details)<>'array' then raise exception 'Array required.';end if;
 for r in select * from jsonb_array_elements(p_details) loop
  if exists(select 1 from public.employees where email=r->>'email') then
   insert into private.allowed_emails(email) values(r->>'email') on conflict do nothing;
   insert into private.pending_profile_details(email,phone,address) values(r->>'email',left(coalesce(r->>'phone',''),40),left(coalesce(r->>'address',''),1000)) on conflict do nothing;
  end if;
 end loop;
end; $$;
revoke all on function public.provision_imported_emails(jsonb) from public,anon,authenticated;
grant execute on function public.provision_imported_emails(jsonb) to service_role;
create function private.attach_private_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.user_id is not null and old.user_id is null then
 insert into public.employee_private_details(user_id,phone,address) select new.user_id,phone,address from private.pending_profile_details where email=new.email on conflict do nothing;
 delete from private.pending_profile_details where email=new.email;
end if;return new;end; $$;
create trigger attach_private_profile after update of user_id on public.employees for each row execute function private.attach_private_profile();
revoke execute on function private.attach_private_profile() from public,anon,authenticated;
