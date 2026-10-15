CREATE OR REPLACE FUNCTION trip_support_private.mapping_basis(p_mapping uuid, p_require_approved boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m trip_support_private.entity_mappings%rowtype;p public.canonical_pois%rowtype;basis jsonb;member_revision bigint;
begin
 select * into m from trip_support_private.entity_mappings where id=p_mapping;if not found or p_require_approved and m.status<>'approved' then return null;end if;
 select * into p from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(p))<>m.canonical_hash then return null;end if;
 if p_require_approved then select revision into member_revision from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if member_revision is distinct from m.reviewer_member_revision then return null;end if;end if;
 basis:=trip_support_private.claim_basis(m.statement_id,m.claim_revision,m.payload_hash,m.basis_metadata->>'city',m.basis_metadata->>'scene',m.basis_metadata->>'locale');if basis is null or basis->>'sourceDigest'<>m.source_digest or basis->'sourceRefs' is distinct from m.source_refs then return null;end if;
 return basis||jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id);
exception when lock_not_available then return null;end $function$
