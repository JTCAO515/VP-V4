"""No target I/O: simulate time/state changes while a human confirmation blocks."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('executor',HERE/'controlled-backup.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class DelayedConfirmation(unittest.TestCase):
    def scenario(self, change=None, expected=None):
        t=m.now(); original_hash=m.code_hash()
        state={'time':t,'used':False,'hash':original_hash}
        approval=dict(approvalId='5f119b16-5127-4087-8d91-c8800cc06c38',target=m.plan.REF,organization=m.plan.ORGANIZATION,
                      codeSha256=original_hash,actions=m.APPROVAL_ACTIONS,approvedBy='JT',writersAndMigratorsQuiesced=True,
                      windowStart=(t-m.timedelta(minutes=1)).isoformat(),windowEnd=(t+m.timedelta(hours=1)).isoformat(),
                      retainUntil=(t+m.timedelta(days=1)).isoformat(),restoreDestination='SYNTHETIC_ONLY',
                      archiveDirectory=m.plan.ARCHIVE_ROOT,identityDirectory=m.plan.IDENTITY_ROOT)
        pinned=json.loads((m.ROOT/'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_text())
        official={**pinned,'observedAt':t.isoformat(),'link_id':m.plan.ACCOUNT['link_id'],'project':m.plan.REF}
        original_read=Path.read_text
        def read(path,*args,**kwargs):
            if str(path)=='synthetic-approval':return json.dumps(approval)
            if str(path)=='synthetic-official':return json.dumps(official)
            return original_read(path,*args,**kwargs)
        def confirm(prompt):
            if change:change(state,official)
            return 'JT APPROVED '+m.plan.REF+' POSTGRES READ BACKUP NEW AGE KEY REALTIME LEDGER'
        with contextlib.ExitStack() as stack:
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            stack.enter_context(patch.object(Path,'read_text',read))
            stack.enter_context(patch.object(m,'now',side_effect=lambda:state['time']))
            stack.enter_context(patch.object(m,'code_hash',side_effect=lambda:state['hash']))
            stack.enter_context(patch.object(m.os.path,'lexists',side_effect=lambda p:state['used']))
            stack.enter_context(patch.object(m.sys.stdin,'isatty',return_value=True))
            stack.enter_context(patch.object(m.sys.stdout,'isatty',return_value=True))
            entered=stack.enter_context(patch('builtins.input',side_effect=confirm))
            execute=stack.enter_context(patch.object(m,'execute',return_value={'status':'MOCK_ONLY'}))
            # Explicitly forbid every downstream action, even if implementation
            # accidentally performs one outside execute(). No real keys/files.
            guards=[stack.enter_context(patch.object(obj,name,side_effect=AssertionError('SIDE_EFFECT_FORBIDDEN')))
                    for obj,name in [(m.subprocess,'run'),(m.subprocess,'Popen'),(m.probe,'checked'),
                                     (m.probe.urllib.request,'urlopen'),(m,'secure_directory'),(m,'exclusive_json')]]
            if expected:
                with self.assertRaisesRegex(ValueError,'^'+expected+'$'):
                    m.main(['--execute','synthetic-approval','synthetic-official'])
                execute.assert_not_called()
            else:
                self.assertEqual(m.main(['--execute','synthetic-approval','synthetic-official']),{'status':'MOCK_ONLY'})
                execute.assert_called_once()
            entered.assert_called_once()
            for guard in guards:guard.assert_not_called()

    def test_delayed_official_observation_expired(self):
        self.scenario(lambda s,o:s.update(time=s['time']+m.timedelta(minutes=6)), 'FRESH_OFFICIAL_EVIDENCE_REQUIRED')

    def test_delayed_window_has_less_than_eleven_minutes(self):
        self.scenario(lambda s,o:s.update(time=s['time']+m.timedelta(minutes=50)), 'MAINTENANCE_WINDOW_INVALID')

    def test_delayed_window_fully_expired(self):
        self.scenario(lambda s,o:s.update(time=s['time']+m.timedelta(hours=2)), 'MAINTENANCE_WINDOW_INVALID')

    def test_uuid_consumed_during_confirmation(self):
        self.scenario(lambda s,o:s.update(used=True), 'APPROVAL_ALREADY_USED')

    def test_code_changed_during_confirmation(self):
        self.scenario(lambda s,o:s.update(hash='changed'), 'APPROVAL_CODE_CONFLICT')

    def test_project_changed_during_confirmation(self):
        self.scenario(lambda s,o:o.update(project='other'), 'OFFICIAL_ACCOUNT_EVIDENCE_REQUIRED')

    def test_schema_changed_during_confirmation(self):
        self.scenario(lambda s,o:o.update(schemas=o['schemas']+['unknown']), 'UNKNOWN_TARGET_CATALOG_REVIEW_REQUIRED')

    def test_versions_changed_during_confirmation(self):
        self.scenario(lambda s,o:o.update(versions=o['versions'][:-1]), 'MIGRATION_COUNT_CONFLICT')

    def test_replaced_still_fresh_evidence_requires_restart(self):
        self.scenario(lambda s,o:o.update(observedAt=(s['time']-m.timedelta(seconds=1)).isoformat()), 'CONFIRMED_INPUT_CHANGED_RESTART_REQUIRED')

    def test_valid_delayed_confirmation_enters_executor_once(self):
        self.scenario(lambda s,o:s.update(time=s['time']+m.timedelta(minutes=1)))


if __name__=='__main__':unittest.main(verbosity=2)
