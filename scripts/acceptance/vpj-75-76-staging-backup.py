"""Encrypted, inspectable backup of the pinned VP-V4 Staging database.

Uses the already-authenticated Supabase CLI's short-lived login role in memory.
The role password, SQL contents, and database rows are never printed or written
as plaintext. The archive is encrypted to a new local age identity, retained
separately under a mode-0700 directory on the FileVault-protected data volume.
"""

from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "db"))
from vpj02_proxy import direct_relay  # noqa: E402

REF = "dzqdzetcctkhbrhlxxgn"
HOST = f"db.{REF}.supabase.co"
CA_URL = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt"
CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
PG_DUMP = "/opt/homebrew/opt/postgresql@17/bin/pg_dump"
PG_RESTORE = "/opt/homebrew/opt/postgresql@17/bin/pg_restore"
SCHEMAS = (
    "public", "auth", "storage", "private", "identity_private", "knowledge_review_private",
    "turn_private", "supabase_migrations",
)


def run(command, *, timeout=60, env=None):
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, env=env)
    if result.returncode:
        raise RuntimeError("COMMAND_FAILED")
    return result.stdout


def cli_login_password():
    # Supabase CLI's dry-run emits a temporary database password. Capture it
    # inside this process only; neither it nor the raw CLI output goes to logs.
    output = run([
        "supabase", "db", "dump", "--linked", "--project-ref", REF, "--dry-run",
    ], timeout=30)
    if f'PGHOST="{HOST}"' not in output or 'PGUSER="cli_login_postgres"' not in output:
        raise RuntimeError("CLI_TARGET_MISMATCH")
    match = re.search(r'^export PGPASSWORD="([A-Za-z0-9_-]{20,})"$', output, re.MULTILINE)
    if not match:
        raise RuntimeError("TEMPORARY_CREDENTIAL_UNAVAILABLE")
    return match.group(1)


def official_ca(directory):
    with urllib.request.urlopen(CA_URL, timeout=15) as response:
        data = response.read(32769)
    if len(data) > 32768 or hashlib.sha256(data).hexdigest() != CA_SHA256:
        raise RuntimeError("CA_CHANGED_OR_INVALID")
    path = directory / "root.crt"
    path.write_bytes(data)
    return path


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("ARGUMENTS_INVALID")
    # FileVault is the second layer of protection for the archive and key.
    if "FileVault is On." not in run(["fdesetup", "status"], timeout=10):
        raise RuntimeError("FILEVAULT_REQUIRED")
    directory = Path.home() / ".codex" / "secure-backups" / "vpj-75-76-staging"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise RuntimeError("BACKUP_DIRECTORY_PERMISSIONS")
    marker = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
    identity = directory / f"{marker}.agekey"
    archive = directory / f"{marker}.dump.age"
    try:
        run(["age-keygen", "-o", str(identity)], timeout=10)
        os.chmod(identity, 0o600)
        recipient = run(["age-keygen", "-y", str(identity)], timeout=10).strip()
        if not recipient.startswith("age1"):
            raise RuntimeError("ENCRYPTION_RECIPIENT_INVALID")
        with ExitStack() as stack:
            temp = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="vpj75-ca-")))
            ca = official_ca(temp)
            relay_host, relay_port = stack.enter_context(direct_relay())
            password = cli_login_password()
            environment = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR") if k in os.environ}
            environment.update({
                "PGPASSWORD": password, "PGHOSTADDR": relay_host,
                "PGSSLMODE": "verify-full", "PGSSLROOTCERT": str(ca),
                "PGGSSENCMODE": "disable", "PGCONNECT_TIMEOUT": "8",
                "PGAPPNAME": "vpj75-76-encrypted-backup", "LC_ALL": "C",
            })
            password = None
            handle = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(handle, "wb") as encrypted:
                    dump = subprocess.Popen([
                        PG_DUMP, "-Fc", "--no-owner", "--no-privileges", "--role=postgres",
                        "-h", HOST, "-p", str(relay_port), "-U", "cli_login_postgres",
                        "-d", "postgres", *[f"--schema={name}" for name in SCHEMAS],
                    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment)
                    try:
                        sealed = subprocess.Popen(
                            ["age", "-r", recipient], stdin=dump.stdout,
                            stdout=encrypted, stderr=subprocess.DEVNULL,
                        )
                        dump.stdout.close()
                        if sealed.wait(timeout=100) or dump.wait(timeout=10):
                            raise RuntimeError("DUMP_OR_ENCRYPTION_FAILED")
                    finally:
                        if dump.poll() is None:
                            dump.kill()
                        if dump.stdout:
                            dump.stdout.close()
                environment["PGPASSWORD"] = ""
            except BaseException:
                archive.unlink(missing_ok=True)
                raise
        # First consume the full authenticated encryption stream, then have
        # pg_restore inspect its TOC. pg_restore may stop reading after the
        # TOC and make its decrypt producer exit with SIGPIPE; that is fine
        # only because the first pass already verified the entire ciphertext.
        integrity = subprocess.run(
            ["age", "-d", "-i", str(identity), str(archive)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )
        if integrity.returncode:
            raise RuntimeError("ARCHIVE_INTEGRITY_FAILED")
        decrypt = subprocess.Popen(
            ["age", "-d", "-i", str(identity), str(archive)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        listing = subprocess.run(
            [PG_RESTORE, "-l"], stdin=decrypt.stdout,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60,
        )
        decrypt.stdout.close()
        decrypt_status = decrypt.wait(timeout=10)
        if decrypt_status not in (0, -13) or listing.returncode:
            raise RuntimeError(f"ARCHIVE_READBACK_FAILED_{decrypt_status}_{listing.returncode}")
        item_count = sum(line.strip()[:1].isdigit() for line in listing.stdout.decode("utf8").splitlines())
        if item_count < 20:
            raise RuntimeError("ARCHIVE_INCOMPLETE")
        return {
            "project": REF, "createdAt": datetime.now(timezone.utc).isoformat(),
            "archive": str(archive), "identity": str(identity),
            "archiveBytes": archive.stat().st_size,
            "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "archiveItems": item_count, "schemas": list(SCHEMAS),
            "tls": "verify-full, pinned official CA, original hostname",
            "status": "ENCRYPTED_ARCHIVE_READBACK_PASS_RESTORE_UNRUN",
        }
    except BaseException:
        archive.unlink(missing_ok=True)
        identity.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2))
    except Exception as error:
        print(json.dumps({"status": "FAILED", "reason": str(error)}))
        sys.exit(1)
