"""Synthetic, local-only security checks; never calls main's host/key import mode."""
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pty
import select
import stat
import tempfile
import termios
import time
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('key_input', Path(__file__).with_name('hidden-key-input.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FAKE_DB = bytearray(b'sb_secret_synthetic_fixture_not_a_real_key')
FAKE_QWEN = bytearray(b'sk-synthetic-fixture-not-a-real-key')

class SecurityChecks(unittest.TestCase):
    def test_database_scope_and_role(self):
        def token(ref=module.PROJECT, role='service_role', exp=None):
            payload = json.dumps({'ref': ref, 'role': role, 'exp': int(time.time()) + 3600 if exp is None else exp}).encode()
            return bytearray(b'fixture.' + base64.urlsafe_b64encode(payload).rstrip(b'=') + b'.synthetic')
        self.assertTrue(module.valid_db(token()))
        self.assertFalse(module.valid_db(token(ref='other-project')))
        self.assertFalse(module.valid_db(token(role='anon')))
        self.assertFalse(module.valid_db(token(exp=1)))
        self.assertFalse(module.valid_db(bytearray(b'sb_publishable_synthetic')))
        self.assertTrue(module.valid_db(FAKE_DB))

    def test_length_character_and_ram_key_refusal(self):
        self.assertFalse(module.valid_qwen(bytearray(b'LTAI-synthetic-RAM-id')))
        self.assertFalse(module.valid_qwen(bytearray(b'sk-contains\nnewline')))
        self.assertFalse(module.valid_qwen(bytearray(b'sk-' + b'x' * 4094)))
        self.assertTrue(module.valid_qwen(bytearray(b'sk-' + b'x' * 4093)))
        self.assertTrue(module.valid_qwen(FAKE_QWEN))

    def test_no_tty_has_no_stdin_fallback(self):
        with mock.patch.object(module.os, 'open', side_effect=OSError('no tty')):
            with self.assertRaisesRegex(module.Refuse, 'CONTROL_TTY_REQUIRED_NO_FALLBACK'):
                module.read_hidden('fixture prompt: ')

    def test_hidden_input_on_synthetic_pty_and_restore(self):
        pid, master = pty.fork()
        if pid == 0:
            try:
                # Simulate a heredoc/non-TTY stdin; /dev/tty must still be used.
                null_fd = os.open(os.devnull, os.O_RDONLY)
                os.dup2(null_fd, 0); os.close(null_fd)
                value = module.read_hidden('fixture prompt: ')
                tty_fd = os.open('/dev/tty', os.O_RDWR)
                restored = bool(termios.tcgetattr(tty_fd)[3] & termios.ECHO)
                os.close(tty_fd)
                print(json.dumps({'matched': value == FAKE_QWEN, 'echoRestored': restored}), flush=True)
                module.wipe(value)
                os._exit(0)
            except BaseException:
                os._exit(1)
        visible = bytearray(); sent = False; status = None
        deadline = time.monotonic() + 5
        try:
            os.set_blocking(master, False)
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.05)[0]:
                    try:
                        chunk = os.read(master, 4096)
                        if chunk: visible.extend(chunk)
                    except (BlockingIOError, OSError):
                        pass
                if not sent and b'fixture prompt: ' in visible:
                    os.write(master, bytes(FAKE_QWEN) + b'\n'); sent = True
                done, candidate = os.waitpid(pid, os.WNOHANG)
                if done:
                    status = candidate
                    break
            self.assertIsNotNone(status, 'synthetic PTY deadline exceeded')
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            self.assertNotIn(bytes(FAKE_QWEN), visible)
            self.assertIn(b'"matched": true', visible)
            self.assertIn(b'"echoRestored": true', visible)
        finally:
            if status is None:
                os.kill(pid, 15); os.waitpid(pid, 0)
            os.close(master)

    def test_exclusive_pair_and_private_metadata(self):
        with tempfile.TemporaryDirectory() as parent:
            destination = os.path.join(parent, 'keys')
            self.assertTrue(module.publish_pair(parent, destination, FAKE_DB, FAKE_QWEN,
                uid=os.getuid(), gid=os.getgid(), publisher=os.rename))
            self.assertEqual(stat.S_IMODE(os.lstat(destination).st_mode), 0o700)
            for name in ('db.key', 'qwen.key'):
                s = os.lstat(os.path.join(destination, name))
                self.assertEqual((s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink),
                                 (os.getuid(), os.getgid(), 0o400, 1))

    def test_existing_path_and_symlink_are_preserved(self):
        with tempfile.TemporaryDirectory() as parent:
            outside = Path(parent, 'existing'); outside.mkdir()
            sentinel = outside / 'unrelated'; sentinel.write_text('preserve')
            link = Path(parent, 'keys'); link.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(module.Refuse):
                module.publish_pair(parent, str(link), FAKE_DB, FAKE_QWEN,
                    uid=os.getuid(), gid=os.getgid(), publisher=os.rename)
            self.assertTrue(link.is_symlink())
            self.assertEqual(sentinel.read_text(), 'preserve')

    def test_failure_cleans_only_new_staging_files(self):
        with tempfile.TemporaryDirectory() as parent:
            destination = Path(parent, 'keys')
            sentinel = Path(parent, 'unrelated'); sentinel.write_text('preserve')
            with mock.patch.object(module.os, 'write', side_effect=OSError('synthetic failure')):
                with self.assertRaises(OSError):
                    module.publish_pair(parent, str(destination), FAKE_DB, FAKE_QWEN,
                        uid=os.getuid(), gid=os.getgid(), publisher=os.rename)
            self.assertEqual(list(Path(parent).iterdir()), [sentinel])

    def test_publish_collision_does_not_remove_other_writer(self):
        with tempfile.TemporaryDirectory() as parent:
            destination = Path(parent, 'keys')
            def collision(source, target):
                destination.mkdir(); (destination / 'unrelated').write_text('preserve')
                raise FileExistsError('synthetic competing writer')
            with self.assertRaises(FileExistsError):
                module.publish_pair(parent, str(destination), FAKE_DB, FAKE_QWEN,
                    uid=os.getuid(), gid=os.getgid(), publisher=collision)
            self.assertEqual((destination / 'unrelated').read_text(), 'preserve')
            self.assertEqual([p.name for p in Path(parent).iterdir()], ['keys'])

    def test_exception_output_never_contains_input_and_buffers_wiped(self):
        db, qwen = bytearray(FAKE_DB), bytearray(FAKE_QWEN)
        output = io.StringIO()
        with mock.patch.object(module, 'verify_host'), mock.patch.object(module, 'storage_preflight'), \
             mock.patch.object(module, 'read_hidden', side_effect=[db, qwen]), \
             mock.patch.object(module, 'publish_pair', side_effect=RuntimeError(bytes(FAKE_QWEN))), \
             contextlib.redirect_stdout(output):
            self.assertEqual(module.main(['--import-existing-approved']), 1)
        self.assertNotIn(bytes(FAKE_QWEN).decode(), output.getvalue())
        self.assertNotIn(bytes(FAKE_DB).decode(), output.getvalue())
        self.assertEqual(set(db), {0}); self.assertEqual(set(qwen), {0})

    def test_default_plan_and_unknown_modes_never_verify_host(self):
        with mock.patch.object(module, 'verify_host') as verify, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(module.main([]), 0)
            self.assertEqual(module.main(['--other']), 1)
            verify.assert_not_called()

if __name__ == '__main__':
    unittest.main(verbosity=1)
