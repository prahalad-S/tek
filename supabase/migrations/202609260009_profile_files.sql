-- Categorized profile files. Offers/personal records are never shared with coworkers.
update storage.buckets set allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='employee-documents';
drop policy owned_upload on storage.objects;
create policy owned_upload on storage.objects for insert to authenticated with check(bucket_id in ('avatars','employee-documents') and private.is_member() and ((storage.foldername(name))[1]=auth.uid()::text or (bucket_id='employee-documents' and private.is_admin())));
drop policy owned_delete on storage.objects;
create policy owned_delete on storage.objects for delete to authenticated using(bucket_id in ('avatars','employee-documents') and private.is_member() and ((storage.foldername(name))[1]=auth.uid()::text or (bucket_id='employee-documents' and private.is_admin())));
create function public.register_profile_document(p_user uuid,p_name text,p_path text,p_mime text,p_size bigint,p_category text) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid;begin
 perform private.assert_member();if p_user<>auth.uid() and not private.is_admin() then raise exception 'File upload is not permitted.';end if;
 if not exists(select 1 from public.employees where user_id=p_user) or split_part(p_path,'/',1)<>p_user::text or not exists(select 1 from storage.objects where bucket_id='employee-documents' and name=p_path) then raise exception 'Upload not found.';end if;
 if length(p_name) not between 1 and 255 or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'Unsupported document.';end if;
 insert into public.employee_documents(user_id,name,object_path,mime_type,size_bytes,category) values(p_user,p_name,p_path,p_mime,p_size,p_category) returning id into v;perform private.audit('profile.document_uploaded',v);return v;end;$$;
create function public.delete_profile_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin perform private.assert_member();delete from public.employee_documents where id=p_id and (user_id=auth.uid() or private.is_admin());if not found then raise exception 'Document not found.';end if;perform private.audit('profile.document_deleted',p_id);end;$$;
revoke all on function public.register_profile_document(uuid,text,text,text,bigint,text),public.delete_profile_document(uuid) from public,anon;
grant execute on function public.register_profile_document(uuid,text,text,text,bigint,text),public.delete_profile_document(uuid) to authenticated;
