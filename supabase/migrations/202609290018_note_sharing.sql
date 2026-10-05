-- Explicit, revocable read-only sharing and per-person likes.
create table public.workspace_note_shares(note_id uuid not null references public.workspace_notes(id) on delete cascade,user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(note_id,user_id));
create index note_shares_recipient on public.workspace_note_shares(user_id,note_id);
create table public.workspace_note_likes(note_id uuid not null references public.workspace_notes(id) on delete cascade,user_id uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),primary key(note_id,user_id));
alter table public.workspace_note_shares enable row level security;
alter table public.workspace_note_likes enable row level security;
grant select on public.workspace_note_shares to authenticated;
grant select,insert,delete on public.workspace_note_likes to authenticated;
create function private.can_read_note(p_note uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_member() and exists(select 1 from public.workspace_notes n where n.id=p_note and (n.owner_id=auth.uid() or exists(select 1 from public.workspace_note_shares s where s.note_id=n.id and s.user_id=auth.uid())))$$;
revoke all on function private.can_read_note(uuid) from public,anon;
grant execute on function private.can_read_note(uuid) to authenticated;
create policy shared_note_read on public.workspace_notes for select to authenticated using(private.can_read_note(id));
create policy shared_attachment_read on public.workspace_files for select to authenticated using(note_id is not null and private.can_read_note(note_id));
create policy shared_storage_read on storage.objects for select to authenticated using(bucket_id='workspace-files' and exists(select 1 from public.workspace_files f where f.object_path=storage.objects.name and f.note_id is not null and private.can_read_note(f.note_id)));
create policy share_read on public.workspace_note_shares for select to authenticated using(private.is_member() and (user_id=auth.uid() or exists(select 1 from public.workspace_notes n where n.id=note_id and n.owner_id=auth.uid())));
create policy likes_read on public.workspace_note_likes for select to authenticated using(private.can_read_note(note_id));
create policy likes_add on public.workspace_note_likes for insert to authenticated with check(user_id=auth.uid() and private.can_read_note(note_id));
create policy likes_remove on public.workspace_note_likes for delete to authenticated using(user_id=auth.uid() and private.can_read_note(note_id));
alter table public.notifications add column note_id uuid references public.workspace_notes(id) on delete set null;
create function public.share_workspace_note(p_note uuid,p_users uuid[]) returns void language plpgsql security definer set search_path='' as $$declare n public.workspace_notes;recipient uuid;sender text;begin
 perform private.assert_member();select * into n from public.workspace_notes where id=p_note and owner_id=auth.uid() for update;
 if n.id is null then raise exception 'Only the note owner can change sharing.';end if;
 if cardinality(p_users)>200 then raise exception 'Share with up to 200 people at a time.';end if;
 if exists(select 1 from unnest(p_users) u where u is null or not exists(select 1 from public.memberships m where m.user_id=u and m.active)) then raise exception 'Choose active employees.';end if;
 select full_name into sender from public.employees where user_id=auth.uid();
 delete from public.workspace_note_shares where note_id=n.id and not(user_id=any(coalesce(p_users,'{}')));
 for recipient in select distinct u from unnest(coalesce(p_users,'{}')) u where u<>auth.uid() loop
 insert into public.workspace_note_shares(note_id,user_id) values(n.id,recipient) on conflict do nothing;
 if found then insert into public.notifications(user_id,title,body,note_id) values(recipient,'A note was shared with you',coalesce(sender,'A coworker')||' shared “'||n.title||'”.',n.id);end if;
 end loop;perform private.audit('note.sharing_updated',n.id);end;$$;
revoke all on function public.share_workspace_note(uuid,uuid[]) from public,anon;
grant execute on function public.share_workspace_note(uuid,uuid[]) to authenticated;
