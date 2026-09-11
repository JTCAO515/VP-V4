import test from 'node:test';
import assert from 'node:assert/strict';
import { getNativeRuntimeConfig } from '../../../lib/server/identity/native-config.ts';
import { nativeIdentityHTTP } from '../../../lib/server/identity/native-http.ts';

const host = 'vp-v4-syntheticonly-jtcao515s-projects.vercel.app';
const url = `https://${host}/api/auth/native/v2/session`;
const settings = {
  VERCEL_ENV: 'preview', VERCEL_URL: host, VISEPANDA_NATIVE_STAGING: 'true',
  VISEPANDA_TRIP_PROTOCOL_V2: 'true', NEXT_PUBLIC_SUPABASE_URL: 'https://dzqdzetcctkhbrhlxxgn.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public', VISEPANDA_NATIVE_STAGING_PROOF_KEY: 'synthetic-proof',
  VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true',
};
function configure(t, patch = {}) {
  const before = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  Object.assign(process.env, settings, patch);
}
test('explicit named Preview binds identity and Trip to the same staging; Trip has no proof key', t => {
  configure(t);
  const identity = getNativeRuntimeConfig({url}, 'session');
  const trip = getNativeRuntimeConfig({url}, 'trip');
  assert.equal(identity.environment, 'staging');
  assert.equal(identity.serviceRoleKey, 'synthetic-proof');
  assert.equal(trip.url, identity.url);
  assert.equal(trip.publishableKey, identity.publishableKey);
  assert.equal('serviceRoleKey' in trip, false);
});
test('production, development, wrong project, mismatched database and protocol cannot activate', t => {
  configure(t);
  for (const patch of [
    {VERCEL_ENV:'production'}, {VERCEL_ENV:'development'}, {VERCEL_ENV:''},
    {VERCEL_URL:'other-project.vercel.app'}, {VERCEL_URL:'vp-v4.vercel.app'},
    {NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_URL:settings.NEXT_PUBLIC_SUPABASE_URL+'/path'},
    {VISEPANDA_TRIP_PROTOCOL_V2:'false'}, {VISEPANDA_NATIVE_STAGING:'false'},
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},
  ]) {
    Object.assign(process.env, settings, patch);
    for (const capability of ['session','trip']) assert.equal(getNativeRuntimeConfig({url},capability),null,JSON.stringify(patch));
  }
});
test('aliases, HTTP, credentials and host lookalikes cannot use deployed native credentials', t => {
  configure(t);
  for (const target of ['https://vp-v4.vercel.app/x', url.replace('https:','http:'),
    url.replace(host,host+'.attacker.test'),url.replace('https://','https://user:password@'),
    'https://vp-v4-other-jtcao515s-projects.vercel.app/x']) {
    assert.equal(getNativeRuntimeConfig({url:target}, 'session'),null);
  }
});
test('LOCAL flags cannot activate a deployed target, and local credentials remain independent', t => {
  configure(t,{VISEPANDA_NATIVE_STAGING:'false',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59721'});
  assert.equal(getNativeRuntimeConfig({url},'session'),null);
  delete process.env.VERCEL_ENV;
  assert.equal(getNativeRuntimeConfig({url:'http://127.0.0.1:3000'},'session').environment,undefined);
});
test('staging handler still rejects mixed credentials and missing JWT without outbound access', async t => {
  configure(t);
  const request = new Request(url);
  const config = getNativeRuntimeConfig(request,'session');
  for (const headers of [{Cookie:'session=synthetic'},{Origin:'https://example.test'}]) {
    assert.equal((await nativeIdentityHTTP(new Request(url,{headers}),'session',config)).status,400);
  }
  assert.equal((await nativeIdentityHTTP(request,'session',config)).status,401);
  process.env.VERCEL_ENV='production';
  assert.equal((await nativeIdentityHTTP(request,'session',config)).status,503);
});
