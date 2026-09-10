import assert from 'node:assert/strict';

/** Match the explicitly selected database protocol without changing the behavioral assertions. */
export async function confirmationDigest(env, headers, proposalId, legacyDigest) {
  if (process.env.VISEPANDA_TRIP_PROTOCOL_V2 !== 'true') return legacyDigest;
  const response = await fetch(env.API_URL + '/rest/v1/rpc/read_trip_proposal_v2', { method:'POST', headers:{...headers,'content-type':'application/json'},body:JSON.stringify({p_proposal_id:proposalId}) });
  assert.equal(response.status,200,'explicit v2 proposal proof must be readable');
  const rows=await response.json();
  assert.match(rows[0]?.digest ?? '',/^trip-v2:[0-9a-f]{64}$/);
  return rows[0].digest;
}
