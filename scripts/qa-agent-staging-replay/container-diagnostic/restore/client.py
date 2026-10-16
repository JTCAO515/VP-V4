"""Bounded private control transport; no SQL, archive, rows or diagnostics log."""
import socket
import sys
raw=sys.stdin.buffer.readline(8192)
if not raw.endswith(b'\n') or len(raw)>=8192:raise SystemExit(1)
with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as channel:
    channel.settimeout(65);channel.connect('/tmp/qaw-restore-control');channel.sendall(raw)
    response=b''
    while not response.endswith(b'\n'):
        block=channel.recv(4096)
        if not block:raise SystemExit(1)
        response+=block
        if len(response)>65536:raise SystemExit(1)
    sys.stdout.buffer.write(response)
