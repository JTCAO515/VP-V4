CREATE OR REPLACE FUNCTION place_actions_private.sources_v1(poi uuid, loc text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare m trip_support_private.entity_mappings%rowtype;b jsonb;c jsonb;scope text;rows jsonb:='[]';n integer:=0;expiry timestamptz:=clock_timestamp()+interval '30 seconds';
begin
 -- The publication reader being disabled is unavailable, not a complete empty result.
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 for m in select * from trip_support_private.entity_mappings where canonical_poi_id=poi and status='approved' and basis_metadata->>'locale'=loc order by id limit 501 for share loop
  n:=n+1;if n>500 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  if m.version>2147483647 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  b:=trip_support_private.mapping_basis(m.id);if b is null then continue;end if;
  scope:=case b->'payload'->'assertion'->>'predicate' when 'located_at' then 'address_reference' when 'opens_during' then 'opening_window_reference' end;
  c:=trip_support_private.typed_claim(b,scope);if c is null then continue;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'statementId',m.statement_id,'claimRevision',m.claim_revision,'payloadHash',m.payload_hash,'sourceDigest',m.source_digest,'scope',scope,'claim',c,'city',m.basis_metadata->>'city','scene',m.basis_metadata->>'scene','locale',loc));
  expiry:=least(expiry,(b->'receipt'->>'expiresAt')::timestamptz);
  if jsonb_array_length(rows)>24 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 end loop;
 return jsonb_build_object('status','complete','entries',rows,'expiresAt',expiry);
exception when lock_not_available then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end $function$
