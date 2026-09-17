"""Ephemeral loopback relay to one verified Supabase IPv6 endpoint via existing proxy.

The relay forwards opaque bytes; libpq/ssl still verifies the original database hostname.
No proxy, DNS, VPN or project configuration is changed.
"""
from contextlib import contextmanager
import ipaddress
import json
import select
import socket
import socketserver
import threading
import time
import urllib.request

HOST = 'db.dzqdzetcctkhbrhlxxgn.supabase.co'
PROXY = ('127.0.0.1', 1082)


def public_ipv6(value):
    address = ipaddress.ip_address(value)
    if address.version != 6 or not address.is_global:
        raise ValueError('PUBLIC_IPV6_REQUIRED')
    return str(address)


def resolve_target():
    # Public DNS metadata only. The DNS answer is not trusted for server identity;
    # both preflight and libpq require CA + original-hostname verification.
    with urllib.request.urlopen(f'https://dns.google/resolve?name={HOST}&type=AAAA', timeout=10) as response:
        raw = response.read(32769)
    if len(raw) > 32768:
        raise ValueError('DNS_RESPONSE_TOO_LARGE')
    value = json.loads(raw)
    answers = [public_ipv6(item['data']) for item in value.get('Answer', []) if item.get('type') == 28 and item.get('name', '').rstrip('.') == HOST]
    if value.get('Status') != 0 or not answers:
        raise ValueError('TARGET_IPV6_UNAVAILABLE')
    return answers[0]


def connect_proxy(address):
    destination = f'[{public_ipv6(address)}]:5432'
    channel = socket.create_connection(PROXY, timeout=8)
    try:
        channel.settimeout(8)
        channel.sendall(f'CONNECT {destination} HTTP/1.1\r\nHost: {destination}\r\n\r\n'.encode('ascii'))
        header = b''
        while not header.endswith(b'\r\n\r\n') and len(header) < 8192:
            part = channel.recv(1)
            if not part:
                break
            header += part
        fields = header.split(b'\r\n', 1)[0].split(b' ')
        if not header.endswith(b'\r\n\r\n') or len(fields) < 2 or fields[0] not in (b'HTTP/1.0', b'HTTP/1.1') or fields[1] != b'200':
            raise ValueError('PROXY_CONNECT_FAILED')
        return channel
    except BaseException:
        channel.close()
        raise


@contextmanager
def direct_relay():
    address = resolve_target()

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                with connect_proxy(address) as remote:
                    self.request.settimeout(5)
                    remote.settimeout(5)
                    deadline = time.monotonic() + 40
                    while time.monotonic() < deadline:
                        readers, _, _ = select.select([self.request, remote], [], [], 1)
                        for source in readers:
                            data = source.recv(65536)
                            if not data:
                                return
                            (remote if source is self.request else self.request).sendall(data)
            except Exception:
                # Never print payloads, socket errors or partial protocol data.
                return

    class Server(socketserver.ThreadingTCPServer):
        daemon_threads = True
        block_on_close = False

    with Server(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address
        finally:
            server.shutdown()
            thread.join(timeout=2)
