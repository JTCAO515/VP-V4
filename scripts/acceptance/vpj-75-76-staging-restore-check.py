"""Attempt a complete restore of the encrypted Staging backup in isolated PG17."""

from contextlib import ExitStack
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile

BIN = Path("/opt/homebrew/opt/postgresql@17/bin")


def run(args, **options):
    result = subprocess.run(args, capture_output=True, timeout=90, **options)
    if result.returncode:
        raise RuntimeError("LOCAL_DATABASE_SETUP_FAILED")
    return result


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("ARGUMENTS_INVALID")
    archive, identity = map(Path, sys.argv[1:])
    if not archive.is_file() or not identity.is_file():
        raise RuntimeError("BACKUP_FILE_MISSING")
    if archive.stat().st_mode & 0o077 or identity.stat().st_mode & 0o077:
        raise RuntimeError("BACKUP_FILE_PERMISSIONS")
    with ExitStack() as stack:
        root = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="vpj75-restore-", dir="/tmp")))
        data, socket = root / "data", root / "socket"
        socket.mkdir(mode=0o700)
        run([str(BIN / "initdb"), "-D", str(data), "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"])
        # No TCP listener. All restored rows live only in this private,
        # short-lived local cluster and are removed when it exits.
        run([str(BIN / "pg_ctl"), "-D", str(data), "-l", str(root / "server.log"),
             "-o", f"-c listen_addresses= -c unix_socket_directories={socket} -c unix_socket_permissions=0700",
             "start"])
        try:
            run([str(BIN / "psql"), "-X", "-w", "-q", "-h", str(socket), "-U", "postgres",
                 "-d", "postgres", "-c",
                 "drop schema public; create role anon; create role authenticated;"
                 "create role service_role; create role authenticator;"
                 "create role supabase_auth_admin; create role supabase_storage_admin;"])
            decrypt = subprocess.Popen(
                ["age", "-d", "-i", str(identity), str(archive)],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            )
            try:
                result = subprocess.run([
                    str(BIN / "pg_restore"), "--exit-on-error", "--no-owner", "--no-privileges",
                    "-h", str(socket), "-U", "postgres", "-d", "postgres",
                ], stdin=decrypt.stdout, stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE, timeout=120)
            finally:
                decrypt.stdout.close()
                decrypt.wait(timeout=10)
            if result.returncode:
                message = result.stderr.decode("utf8", errors="replace").lower()
                first_error = next((line.strip()[:240] for line in message.splitlines()
                                    if line.startswith("pg_restore: error:") or line.startswith("pg_restore: error")), "")
                category = next((label for label, token in [
                    ("EXTENSION_MISSING", "extension"), ("ROLE_MISSING", "role"),
                    ("SCHEMA_MISSING", "schema"), ("RELATION_MISSING", "relation"),
                    ("FUNCTION_MISSING", "function"),
                ] if token in message), "RESTORE_ERROR")
                return {"status": "RESTORE_INCOMPLETE", "category": category,
                        "firstError": first_error}
            result = run([str(BIN / "psql"), "-X", "-w", "-A", "-t", "-q", "-h", str(socket),
                          "-U", "postgres", "-d", "postgres", "-c",
                          "select (select count(*) from supabase_migrations.schema_migrations),"
                          "(select count(*) from public.trips),"
                          "(select count(*) from auth.users);"], text=True)
            values = result.stdout.strip().split("|")
            if values != ["50", "3", "7"]:
                return {"status": "RESTORE_COUNT_MISMATCH", "counts": values}
            return {"status": "ISOLATED_RESTORE_PASS", "migrationCount": 50, "tripCount": 3, "authCount": 7}
        finally:
            subprocess.run([str(BIN / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2))
    except Exception as error:
        print(json.dumps({"status": "FAILED", "reason": str(error)}))
        sys.exit(1)
