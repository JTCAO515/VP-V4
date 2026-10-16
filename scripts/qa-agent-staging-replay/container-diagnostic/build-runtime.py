"""Build only the explicit source allowlist; never send the repo/private data."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
BASE='sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b'
HELPER_COMMIT='edec7a531824a11634851c7a64b2083c1bd27aa4'
FILES=['owned-pg-diagnostic-session.py','typed-pg-diagnostic-proxy.py','diagnostic-window-deadline.py','container-diagnostic/Dockerfile','container-diagnostic/service.py']

def run(args):return subprocess.check_output(args,stderr=subprocess.DEVNULL)

def probe(image,command):
    return run(['docker','run','--rm','--pull=never','--network','none','--user','postgres','--entrypoint','/bin/sh',image,'-c',command]).decode().strip()

def main():
    if any(k in os.environ for k in ('DOCKER_HOST','DOCKER_CONTEXT')):raise ValueError('DOCKER_OVERRIDE_REJECTED')
    context=run(['docker','context','show']).decode().strip()
    endpoint=json.loads(run(['docker','context','inspect',context]))[0]['Endpoints']['docker']['Host']
    if not endpoint.startswith('unix://'):raise ValueError('LOCAL_DOCKER_REQUIRED')
    expected=run(['git','show',HELPER_COMMIT+':scripts/qa-agent-staging-replay/owned-pg-diagnostic-session.py'])
    if expected!=(ROOT/FILES[0]).read_bytes():raise ValueError('FROZEN_HELPER_CHANGED')
    info=json.loads(run(['docker','image','inspect',BASE]))[0]
    if info['Id']!=BASE or info['Architecture']!='arm64' or info['Config'].get('Volumes'):raise ValueError('BASE_IMAGE_CONFLICT')
    stream=io.BytesIO()
    with tarfile.open(fileobj=stream,mode='w') as archive:
        for name in FILES:
            data=(ROOT/name).read_bytes();item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o644;archive.addfile(item,io.BytesIO(data))
    subprocess.run(['docker','build','--pull=false','--provenance=false','--progress=plain','-f','container-diagnostic/Dockerfile','-t','qaw683-diagnostic:synthetic-edec','-'],input=stream.getvalue(),check=True)
    image=json.loads(run(['docker','image','inspect','qaw683-diagnostic:synthetic-edec']))[0]['Id']
    command='sha256sum $(command -v postgres) | cut -d " " -f 1'
    pg=probe(BASE,command)
    if pg!=probe(image,command):raise ValueError('POSTGRES_BINARY_CHANGED')
    packages=probe(image,'cat /opt/qaw/runtime-packages.txt')+'\n'
    locked=json.loads((HERE/'packages.lock.json').read_text())['fullInstalled']
    if sorted(packages.splitlines())!=sorted(k+'-'+v for k,v in locked.items()):raise ValueError('RUNTIME_PACKAGE_LOCK_CONFLICT')
    (HERE/'runtime-packages.txt').write_text(packages)
    pins={'baseImage':BASE,'imageId':image,'pythonVersion':'3.12.15','helperSha256':hashlib.sha256(expected).hexdigest(),'helperCommit':HELPER_COMMIT,'postgresBinarySha256':pg,'sourceSha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in FILES},'packagesSha256':hashlib.sha256(packages.encode()).hexdigest(),'apkTrustKeyHashes':probe(image,'sha256sum /etc/apk/keys/*.pub'),'officialPackageSource':'https://dl-cdn.alpinelinux.org/alpine/v3.23/main','packageSignaturePolicy':'apk default trusted keys, no allow-untrusted; exact versions in Dockerfile and packages.lock.json'}
    (HERE/'runtime-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
    print(json.dumps({'builtImage':image,'postgresBinaryUnchanged':True}))

if __name__=='__main__':main()
