#!/usr/bin/env python3
"""JT-only temporary key preparation. Default is plan; never starts a worker."""
import base64
import ctypes
import json
import os
import resource
import signal
import stat
import subprocess
import sys
import tempfile
import termios
import time
import urllib.request

INSTANCE = 'i-j6c7q3kftufyroypiqvu'
PROJECT = 'dzqdzetcctkhbrhlxxgn'
DEST = '/run/vp-worker-secrets'
LIMIT = 4096
SAFE_ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}
KNOWN = (DEST, DEST + '/db.key', DEST + '/qwen.key',
         '/etc/visepanda/hosted-text-worker.env', '/etc/visepanda/hosted-profile.json',
         '/etc/visepanda/qa/qa-target.json', '/var/lib/vp-worker/journal')

class Refuse(Exception):
    pass

def wipe(value):
    if isinstance(value, bytearray):
        value[:] = b'\0' * len(value)

def bounded_ascii(value):
    return isinstance(value, bytearray) and 1 <= len(value) <= LIMIT and all(33 <= b <= 126 for b in value)

def valid_db(value):
    if not bounded_ascii(value):
        return False
    if value.startswith(b'sb_secret_'):
        # Opaque project binding is JT's console selection, not provable offline.
        return len(value) > len(b'sb_secret_')
    try:
        parts = value.split(b'.')
        if len(parts) != 3:
            return False
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + b'==='))
        return (payload.get('role') == 'service_role' and payload.get('ref') == PROJECT
                and type(payload.get('exp')) is int and payload['exp'] > time.time())
    except Exception:
        return False

def valid_qwen(value):
    # Existing Model Studio API key, not Alibaba RAM AccessKey ID/secret.
    return bounded_ascii(value) and value.startswith(b'sk-') and len(value) > 10

def no_dumps():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(4, 0, 0, 0, 0) != 0 or libc.prctl(3, 0, 0, 0, 0) != 0:
        raise Refuse('CORE_PROTECTION_UNAVAILABLE')
    if resource.getrlimit(resource.RLIMIT_CORE) != (0, 0):
        raise Refuse('CORE_PROTECTION_UNAVAILABLE')

def verify_host():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise Refuse('APPROVED_LINUX_ROOT_REQUIRED')
    no_dumps()
    # Instance identity only; no RAM credential endpoint/token and no proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open('http://100.100.100.200/latest/meta-data/instance-id', timeout=3) as response:
            instance = response.read(129).decode('ascii').strip()
        if instance != INSTANCE:
            raise Refuse('INSTANCE_IDENTITY_MISMATCH')
    except Refuse:
        raise
    except Exception:
        raise Refuse('INSTANCE_IDENTITY_UNVERIFIED')

def storage_preflight():
    run_info = os.lstat('/run')
    if not stat.S_ISDIR(run_info.st_mode) or stat.S_ISLNK(run_info.st_mode) or run_info.st_uid != 0 or run_info.st_mode & 0o022:
        raise Refuse('RUN_DIRECTORY_UNSAFE')
    p = subprocess.run(['findmnt', '-n', '-o', 'FSTYPE', '-T', '/run'], env=SAFE_ENV,
                       capture_output=True, text=True, timeout=5)
    if p.returncode or p.stdout.strip() != 'tmpfs':
        raise Refuse('RUN_NOT_TMPFS_NO_SYSTEM_CHANGE')
    with open('/proc/swaps', encoding='ascii') as source:
        if len(source.read(65536).strip().splitlines()) != 1:
            raise Refuse('SWAP_ACTIVE_NO_SYSTEM_CHANGE')
    p = subprocess.run(['docker', 'ps', '-aq'], env=SAFE_ENV, capture_output=True, text=True, timeout=10)
    if p.returncode or p.stdout.strip():
        raise Refuse('WORKER_CONTAINER_STATE_NOT_EMPTY')
    if os.path.lexists(DEST):
        raise Refuse('EXISTING_SECRET_PATH_NO_OVERWRITE')
    if not hasattr(ctypes.CDLL(None), 'renameat2'):
        raise Refuse('ATOMIC_NO_OVERWRITE_UNAVAILABLE')

def metadata():
    rows = []
    for path in KNOWN:
        try:
            s = os.lstat(path)
            rows.append({'path': path, 'exists': True, 'symlink': stat.S_ISLNK(s.st_mode),
                         'uid': s.st_uid, 'gid': s.st_gid, 'mode': oct(stat.S_IMODE(s.st_mode)),
                         'links': s.st_nlink, 'size': s.st_size if stat.S_ISREG(s.st_mode) else None})
        except FileNotFoundError:
            rows.append({'path': path, 'exists': False})
    return {'knownInstanceVerified': True, 'knownPathMetadata': rows, 'valuesRead': False}

def read_hidden(prompt):
    try:
        fd = os.open('/dev/tty', os.O_RDWR | os.O_NOCTTY)
    except OSError:
        raise Refuse('CONTROL_TTY_REQUIRED_NO_FALLBACK')
    value = bytearray()
    saved = None
    try:
        if not os.isatty(fd):
            raise Refuse('CONTROL_TTY_REQUIRED_NO_FALLBACK')
        saved = termios.tcgetattr(fd)
        hidden = list(saved)
        hidden[6] = list(saved[6])
        hidden[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON)
        hidden[6][termios.VMIN] = 1
        hidden[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        if termios.tcgetattr(fd)[3] & (termios.ECHO | termios.ECHONL | termios.ICANON):
            raise Refuse('TTY_ECHO_CONTROL_FAILED')
        os.write(fd, prompt.encode('utf-8'))
        while True:
            char = os.read(fd, 1)
            if not char or char == b'\x04':
                raise Refuse('INPUT_ABORTED')
            if char in (b'\n', b'\r'):
                break
            if char in (b'\x08', b'\x7f'):
                if value:
                    value[-1] = 0
                    value.pop()
                continue
            if len(value) == LIMIT or not 33 <= char[0] <= 126:
                raise Refuse('INPUT_LENGTH_OR_CHARACTER_INVALID')
            value.extend(char)
        os.write(fd, b'\n')
        if not value:
            raise Refuse('EMPTY_INPUT')
        return value
    except BaseException:
        wipe(value)
        raise
    finally:
        if saved is not None:
            termios.tcsetattr(fd, termios.TCSAFLUSH, saved)
        os.close(fd)

def rename_no_replace(source, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1) != 0:
        raise OSError(ctypes.get_errno(), 'atomic publish refused')

def publish_pair(parent, destination, db, qwen, uid=1000, gid=1000, publisher=rename_no_replace):
    if os.path.lexists(destination):
        raise Refuse('EXISTING_SECRET_PATH_NO_OVERWRITE')
    stage = tempfile.mkdtemp(prefix='.vp-worker-key-input-', dir=parent)
    stage_info = os.lstat(stage)
    dir_fd = os.open(stage, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    created = {}
    published = False
    try:
        for name, value in (('db.key', db), ('qwen.key', qwen)):
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o000, dir_fd=dir_fd)
            try:
                created[name] = os.fstat(fd).st_ino
                offset = 0
                while offset < len(value):
                    n = os.write(fd, memoryview(value)[offset:])
                    if n < 1:
                        raise Refuse('PRIVATE_FILE_WRITE_FAILED')
                    offset += n
                os.fsync(fd)
                os.fchown(fd, uid, gid)
                os.fchmod(fd, 0o400)
                s = os.fstat(fd)
                if (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink, s.st_size) != (uid, gid, 0o400, 1, len(value)):
                    raise Refuse('PRIVATE_FILE_METADATA_INVALID')
            finally:
                os.close(fd)
        os.fchown(dir_fd, uid, gid)
        os.fchmod(dir_fd, 0o700)
        os.fsync(dir_fd)
        publisher(stage, destination)
        published = True
        s = os.lstat(destination)
        if s.st_ino != stage_info.st_ino or (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) != (uid, gid, 0o700):
            raise Refuse('PRIVATE_DIRECTORY_METADATA_INVALID')
        return True
    except BaseException:
        # Delete only inodes exclusively created by this invocation; preserve collisions.
        for name, inode in created.items():
            try:
                s = os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
                if stat.S_ISREG(s.st_mode) and s.st_ino == inode:
                    os.unlink(name, dir_fd=dir_fd)
            except FileNotFoundError:
                pass
        owned_path = destination if published else stage
        try:
            if os.lstat(owned_path).st_ino == stage_info.st_ino:
                os.rmdir(owned_path)
        except FileNotFoundError:
            pass
        raise
    finally:
        os.close(dir_fd)

def main(args):
    if args == ['--plan'] or not args:
        print(json.dumps({'prepared': False, 'userExecutedOnly': True, 'temporary': True,
                          'instance': INSTANCE, 'project': PROJECT, 'knownPaths': list(KNOWN)}))
        return 0
    if args not in (['--metadata'], ['--import-existing-approved']):
        print(json.dumps({'prepared': False, 'reason': 'EXPLICIT_USER_MODE_REQUIRED'}))
        return 1
    db = qwen = None
    try:
        verify_host()
        if args == ['--metadata']:
            print(json.dumps(metadata()))
            return 0
        storage_preflight()
        db = read_hidden('固定 Staging service-role/secret key（隐藏输入，非 anon/数据库密码）：')
        if not valid_db(db):
            raise Refuse('STAGING_BACKEND_KEY_TYPE_OR_BINDING_INVALID')
        qwen = read_hidden('既有百炼业务空间 API key（隐藏输入，非 RAM AccessKey）：')
        if not valid_qwen(qwen) or db == qwen:
            raise Refuse('PROVIDER_API_KEY_TYPE_INVALID')
        publish_pair('/run', DEST, db, qwen)
        print(json.dumps({'prepared': True, 'permissionsValid': True, 'temporary': True,
                          'workerStarted': False, 'databaseOrProviderCalled': False,
                          'liveAuthenticationValidated': False}))
        return 0
    except Refuse as error:
        print(json.dumps({'prepared': False, 'reason': str(error)}))
        return 1
    except BaseException:
        print(json.dumps({'prepared': False, 'reason': 'INPUT_OR_IMPORT_FAILED'}))
        return 1
    finally:
        wipe(db)
        wipe(qwen)

if __name__ == '__main__':
    for sig in (signal.SIGTERM, signal.SIGTSTP):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Refuse('INPUT_ABORTED')))
    sys.exit(main(sys.argv[1:]))
