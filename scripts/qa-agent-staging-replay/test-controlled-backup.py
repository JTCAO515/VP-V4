import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('executor',HERE/'controlled-backup.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class Gates(unittest.TestCase):
    def approval(self):
        t=m.now()
        return dict(approvalId='5f119b16-5127-4087-8d91-c8800cc06c38',target=m.plan.REF,organization=m.plan.ORGANIZATION,
                    codeSha256=m.code_hash(),actions=m.APPROVAL_ACTIONS,approvedBy='JT',writersAndMigratorsQuiesced=True,
                    windowStart=(t-m.timedelta(minutes=1)).isoformat(),windowEnd=(t+m.timedelta(hours=1)).isoformat(),
                    retainUntil=(t+m.timedelta(days=1)).isoformat(),restoreDestination='SYNTHETIC_TEST_ONLY_NOT_AUTHORIZATION',
                    archiveDirectory=m.plan.ARCHIVE_ROOT,identityDirectory=m.plan.IDENTITY_ROOT)

    def test_default_no_network_or_process(self):
        with patch.object(m.subprocess,'run',side_effect=AssertionError('process forbidden')), patch.object(m.subprocess,'Popen',side_effect=AssertionError('process forbidden')), patch.object(m.probe.urllib.request,'urlopen',side_effect=AssertionError('network forbidden')):
            self.assertEqual(m.main([])['status'],'DRY_RUN_NO_TARGET_IO')
            self.assertEqual(m.main(['--dry-run'])['targetRead'],False)

    def test_non_tty_cannot_execute(self):
        with patch.object(m.sys.stdin,'isatty',return_value=False),patch.object(m,'execute',side_effect=AssertionError('execute forbidden')):
            with self.assertRaises(ValueError):m.main(['--execute','not-opened','not-opened'])

    def test_approval_exact_code_scope_window_destination(self):
        a=self.approval();m.validate_approval(a,m.now())
        for key,value in [('target','other'),('codeSha256','old'),('actions',[]),('approvedBy','agent'),('writersAndMigratorsQuiesced',False),('archiveDirectory','/tmp'),('restoreDestination',''),('windowEnd',(m.now()-m.timedelta(minutes=1)).isoformat())]:
            changed=copy.deepcopy(a);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_approval(changed,m.now())

    def test_once_only_exclusive_record(self):
        with tempfile.TemporaryDirectory(dir=m.ROOT/'artifacts/QAWEB/staging-replay',prefix='gate-test-') as d:
            p=Path(d)/'synthetic-used.json';m.exclusive_json(p,{'synthetic':True})
            with self.assertRaises(FileExistsError):m.exclusive_json(p,{'synthetic':True})
            self.assertEqual(p.stat().st_mode&0o077,0)

    def test_no_unbounded_relay_or_plaintext_dump_flags(self):
        relay=(HERE/'backup-relay.py').read_text();self.assertIn('time.monotonic() + 900',relay)
        source=(HERE/'controlled-backup.py').read_text()
        self.assertNotIn('--no-owner',source);self.assertNotIn('--no-privileges',source)
        self.assertIn('--no-role-passwords',source)
        self.assertIn('default_transaction_read_only=on',source)
        self.assertIn('FAILED_QUARANTINE.json',source)


if __name__=='__main__':unittest.main(verbosity=2)
