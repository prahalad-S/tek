-- Uniform date restrictions: role alone does not bypass the historical edit window.
create or replace function private.assert_calendar_date(p_user uuid,p_date date) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_member();
 if p_user<>auth.uid() and not private.can_review(p_user) then raise exception 'Calendar access is not permitted.';end if;
 if p_date is null or abs(p_date-private.calendar_today())>730 then raise exception 'Choose a date within two years.';end if;
 if (p_date::timestamp at time zone 'Asia/Kolkata')<now()-interval '48 hours' and not exists(select 1 from public.calendar_access_requests where user_id=p_user and status='approved' and p_date between from_date and to_date and expires_at>now()) then raise exception 'Restricted date: older than 48 hours. Request temporary access from your team lead.' using errcode='42501';end if;
end;$$;
create table public.employee_map_locations(user_id uuid primary key references auth.users(id) on delete cascade,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),shared boolean not null default false,updated_at timestamptz not null default now());
alter table public.employee_map_locations enable row level security;
grant select on public.employee_map_locations to authenticated;
create policy map_visibility on public.employee_map_locations for select to authenticated using(private.is_member() and (user_id=auth.uid() or private.is_admin() or shared));
create function public.save_my_map_pin(p_lat double precision,p_lon double precision,p_address text,p_shared boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_member();if length(trim(p_address))<3 or not exists(select 1 from public.employee_private_details where user_id=auth.uid() and address=p_address) then raise exception 'Save your current address before setting a map pin.';end if;
 insert into public.employee_map_locations(user_id,latitude,longitude,shared) values(auth.uid(),p_lat,p_lon,p_shared) on conflict(user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,shared=excluded.shared,updated_at=now();perform private.audit('profile.map_updated',auth.uid());end;$$;
create function public.remove_my_map_pin() returns void language plpgsql security definer set search_path='' as $$begin perform private.assert_member();delete from public.employee_map_locations where user_id=auth.uid();end;$$;
create function private.invalidate_map_pin() returns trigger language plpgsql security definer set search_path='' as $$begin if new.address is distinct from old.address then delete from public.employee_map_locations where user_id=new.user_id;end if;return new;end;$$;
create trigger address_map_changed after update of address on public.employee_private_details for each row execute function private.invalidate_map_pin();
create table private.geocoder_usage(user_id uuid primary key,window_start timestamptz not null,requests integer not null);
create table private.geocoder_clock(id boolean primary key default true check(id),last_call timestamptz not null);
insert into private.geocoder_clock values(true,'1970-01-01');
create function public.reserve_profile_geocoding() returns boolean language plpgsql security definer set search_path='' as $$declare n integer;last_time timestamptz;begin perform private.assert_member();select last_call into last_time from private.geocoder_clock where id for update;if last_time>now()-interval '2 seconds' then return false;end if;
 insert into private.geocoder_usage values(auth.uid(),now(),1) on conflict(user_id) do update set requests=case when private.geocoder_usage.window_start<now()-interval '1 hour' then 1 else private.geocoder_usage.requests+1 end,window_start=case when private.geocoder_usage.window_start<now()-interval '1 hour' then now() else private.geocoder_usage.window_start end returning requests into n;
 if n>10 then return false;end if;update private.geocoder_clock set last_call=now() where id;return true;end;$$;
revoke all on function private.invalidate_map_pin() from public,anon,authenticated;
revoke all on function public.save_my_map_pin(double precision,double precision,text,boolean),public.remove_my_map_pin(),public.reserve_profile_geocoding() from public,anon;
grant execute on function public.save_my_map_pin(double precision,double precision,text,boolean),public.remove_my_map_pin(),public.reserve_profile_geocoding() to authenticated;
