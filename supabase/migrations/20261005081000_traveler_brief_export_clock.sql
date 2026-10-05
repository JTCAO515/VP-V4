-- VPJ-31: exact export lease endpoints share one wall-clock observation.
-- Keep the merged migration immutable and the existing 30-second constraint,
-- signature, search_path, ownership/session/source fences and ACL unchanged.
create or replace function service_brief_private.export(owner uuid,sess uuid,req uuid) returns jsonb language plpgsql set search_path='' as $$
declare c service_cases_private.cases;b service_brief_private.briefs;p service_brief_private.previews;f jsonb;rows jsonb;out jsonb;lease service_brief_private.export_leases;dig text;basis jsonb:='[]';n integer;lease_captured_at timestamptz;
begin
 -- All Cases first, before any Brief/source; privacy export never grants staff data.
 perform 1 from service_cases_private.cases where owner_id=owner order by id for update nowait;
 for c in select * from service_cases_private.cases where owner_id=owner order by id loop
 select * into b from service_brief_private.briefs where case_id=c.id for update nowait;
 if b.state='shared' then
 if c.revoked or c.expires_at<=clock_timestamp() or b.expires_at<=clock_timestamp() then
 perform service_brief_private.invalidate(c.id,owner,owner);
 else
 perform service_brief_private.qualify(c,owner,'owner',true);
 f:=service_brief_private.current_fields(c,b);basis:=basis||jsonb_build_array(f);
 end if;end if;
 for p in select * from service_brief_private.previews where case_id=c.id order by id for update nowait loop
 if p.expires_at<=clock_timestamp() or c.revoked or c.expires_at<=clock_timestamp() then delete from service_brief_private.previews where id=p.id;
 else
 perform service_brief_private.qualify(c,owner,'owner',true);
 f:=service_brief_private.fields(c,p.sources);
 if p.grant_revision<>c.revision or p.recipient_id<>c.recipient_id or p.source_digest<>service_brief_private.hash(service_brief_private.binding(c)||jsonb_build_object('fields',f)) then raise exception 'BRIEF_STALE';end if;
 basis:=basis||jsonb_build_array(f);
 end if;
 end loop;
 end loop;
 select count(*) into n from (select 1 from service_brief_private.export_rows(owner) limit 10001) q;if n>10000 then raise exception 'BRIEF_LIMIT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'domain',domain,'value',value) order by key),'[]') into rows from service_brief_private.export_rows(owner);
 -- Hash current full rights as well as data; never retain the projected values.
 dig:=service_brief_private.hash(jsonb_build_array(rows,basis));
 perform pg_advisory_xact_lock(hashtextextended('traveler-brief-export:'||owner||':'||sess||':'||req,0));
 select * into lease from service_brief_private.export_leases where owner_id=owner and session_id=sess and request_id=req for update;
 if found then
 if lease.expires_at<=clock_timestamp() or lease.source_digest<>dig then raise exception 'BRIEF_STALE';end if;
 else
 lease_captured_at:=clock_timestamp();
 insert into service_brief_private.export_leases values(owner,sess,req,lease_captured_at,lease_captured_at+interval '30 seconds',dig) returning * into lease;
 end if;
 out:=jsonb_build_object('schemaVersion','traveler-brief-data/1','kind','bundle','requestId',req,'ownerId',owner,'sessionId',sess,'capturedAt',service_operations_private.ms(lease.captured_at),'expiresAt',service_operations_private.ms(lease.expires_at),'sourceDigest',dig,
 'corePackageEnrollment','not_enrolled','allUserDataCompleted',false,'coverage',jsonb_build_object('brief','complete','previews','complete','audit','complete','operations','complete','sourceValues','not_copied','attachments','unavailable'),'rows',rows);
 if octet_length(convert_to(jsonb_build_object('data',out)::text,'UTF8'))>524288 then raise exception 'BRIEF_LIMIT';end if;
 if lease.expires_at<=clock_timestamp() then raise exception 'BRIEF_STALE';end if;
 return out;
end $$;
