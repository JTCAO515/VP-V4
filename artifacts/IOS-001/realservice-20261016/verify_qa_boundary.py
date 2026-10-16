"""Offline source proof of current browser and Native target boundaries; no HTTP."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

QA = '4abeeb41e87f2ac36f0efdb9ba94780ce0049a13'
OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
paths = ['lib/server/qa-agent/browser-boundary.ts', 'lib/server/identity/native-config.ts']
pins = {}
with tempfile.TemporaryDirectory(prefix='ios001-qa-boundary-') as tmp:
    temp = Path(tmp)
    for path in paths:
        data = subprocess.check_output(['git', 'show', QA + ':' + path], cwd=ROOT)
        pins[path] = hashlib.sha256(data).hexdigest()
        (temp / Path(path).name).write_bytes(data)
    (temp / 'probe.mjs').write_text('''
import assert from 'node:assert/strict';
import {browserBoundary} from './browser-boundary.ts';
import {nativeTargetAllowed} from './native-config.ts';
const qa = 'https://qatesting.go2china.space';
assert.equal(browserBoundary(new Request(qa + '/api/qa-agent/sessions')), true);
assert.equal(browserBoundary(new Request(qa + '/api/qa-agent/sessions', {headers: {authorization: 'Bearer synthetic-invalid'}})), false);
assert.equal(browserBoundary(new Request(qa + '/api/qa-agent/sessions', {method: 'POST'})), false);
Object.assign(process.env, {VERCEL_ENV: 'preview', VERCEL_URL: 'vp-v4-sourceprobe-jtcao515s-projects.vercel.app', VISEPANDA_NATIVE_STAGING: 'true', VISEPANDA_TRIP_PROTOCOL_V2: 'true'});
const config = {url: 'https://dzqdzetcctkhbrhlxxgn.supabase.co', publishableKey: 'synthetic-public-placeholder', environment: 'staging'};
assert.equal(nativeTargetAllowed(config, {url: 'https://' + process.env.VERCEL_URL}), true);
assert.equal(nativeTargetAllowed(config, {url: qa}), false);
process.env.VISEPANDA_NATIVE_STAGING_CUSTOM_ORIGIN = 'https://staging.go2china.space';
assert.equal(nativeTargetAllowed(config, {url: process.env.VISEPANDA_NATIVE_STAGING_CUSTOM_ORIGIN}), true);
process.env.VISEPANDA_NATIVE_STAGING_CUSTOM_ORIGIN = qa;
assert.equal(nativeTargetAllowed(config, {url: qa}), false);
console.log('PASS: 7 offline current-source boundary assertions; zero network/Auth/provider');
''')
    # Supply only executable PATH; no inherited account/provider environment.
    subprocess.run([shutil.which('node'), str(temp / 'probe.mjs')], env={'PATH': os.defpath}, cwd=temp, check=True)
print(json.dumps({'qa_source': QA, 'sha256': pins, 'assertions': 7}))
