-- #238/#663: preserve the original source frontier with ONE state-row write.
-- A second UPDATE in the same transaction makes PostgreSQL recheck unchanged
-- auth.users FK keys on the newly created tuple version. That reverse KEY SHARE
-- wait can deadlock with an author root waiting for the reviewer's source row.
-- Keep the original UPSERT, null-reviewer fence retention, deletion and grant
-- invalidation. Auth/session roots, row-lock modes, CAS and RPC ACL stay intact.
create or replace function community_safety_private.source_frontier() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
 update community_safety_private.states set author_id=null,j1_status='deleted',submission_version=greatest(submission_version,old.version) where submission_id=old.id;
 update community_safety_private.controlled_readers set revoked=true where submission_id=old.id;
 return old;end if;
 insert into community_safety_private.states(submission_id,author_id,submission_version,j1_status,j1_operator_fence) values(new.id,new.author_id,new.version,new.status,case when new.reviewer_id is not null then encode(sha256(convert_to(new.reviewer_id::text,'UTF8')),'hex') else null end)
 on conflict(submission_id) do update set author_id=excluded.author_id,submission_version=excluded.submission_version,j1_status=excluded.j1_status,
 j1_operator_fence=coalesce(excluded.j1_operator_fence,community_safety_private.states.j1_operator_fence);
 if new.status in('withdrawn','deleted') then update community_safety_private.controlled_readers set revoked=true where submission_id=new.id;end if;
 return new;
end $$;
