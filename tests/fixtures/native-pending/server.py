"""Synthetic loopback only: run before opt-in NativeAsk process recovery UI tests."""
import json
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

state = {'posts': [], 'hidden': True, 'drop': False}
lock = Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_DELETE(self):
        self.handle_request()

    def handle_request(self):
        size = int(self.headers.get('Content-Length', '0'))
        if size > 64000:
            self.send_error(413)
            return
        body = json.loads(self.rfile.read(size)) if size else {}
        path = self.path.split('?')[0]
        with lock:
            if path == '/control':
                if body.get('reset'):
                    state.update(posts=[], hidden=True, drop=body.get('drop', False))
                if body.get('release'):
                    state['hidden'] = False
                reply = {'posts': len(state['posts'])}
            elif path == '/state':
                reply = {'posts': len(state['posts'])}
            elif path.endswith('/credentials') or path.endswith('/refresh'):
                reply = {'subject': 'synthetic-owner', 'accessToken': 'synthetic-token',
                         'refreshToken': 'synthetic-refresh', 'expiresAt': time.time() + 3600, 'mobileEpoch': 1}
            elif path.endswith('/profile'):
                reply = {'subject': 'synthetic-owner', 'displayName': 'Synthetic recovery test'}
            elif path.endswith('/policy'):
                reply = {'version': 3, 'kind': 'policy', 'policy': {
                    'id': '11111111-1111-4111-8111-111111111111', 'provider': 'qwen',
                    'recipient': 'synthetic only', 'sourceRegion': 'local', 'processingRegion': 'local',
                    'storageRegion': 'local', 'termsVersion': 'synthetic', 'noticeVersion': 'synthetic',
                    'noticeHash': 'a' * 64, 'noticeZh': '本机合成测试，无供应商调用。',
                    'noticeEn': 'Synthetic local test. No supplier call.', 'retention': 'retain_after_hide_v1',
                    'expiresAt': '2099-01-01', 'consentState': 'accepted'}}
            elif path.endswith('/turns') and self.command == 'POST':
                state['posts'].append(body)
                if state['drop']:
                    state['drop'] = False
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                task = body['serviceTask']
                reply = {'version': 3, 'kind': 'accepted', 'turnId': body['turnId'], 'reused': False,
                         'serviceTaskId': task['id'], 'scopeVersion': 1,
                         'relationship': task['relationship'], 'parentTurnId': task.get('parentTurnId')}
            elif path.endswith('/turns'):
                turns = []
                if not state['hidden'] and state['posts']:
                    item = state['posts'][0]
                    task = item['serviceTask']
                    turns = [{'turnId': item['turnId'], 'threadId': item['threadId'], 'locale': item['locale'],
                              'input': item['text'], 'outcome': 'answered', 'status': 'completed',
                              'output': 'Synthetic recovered answer', 'createdAt': '2026-09-12',
                              'serviceTaskId': task['id'], 'scopeVersion': 1,
                              'relationship': task['relationship'], 'parentTurnId': task.get('parentTurnId')}]
                reply = {'version': 3, 'kind': 'history', 'turns': turns}
            else:
                reply = {'subject': 'synthetic-owner', 'mobileEpoch': 1}
        data = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 59653), Handler).serve_forever()
