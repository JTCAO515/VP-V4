import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


m=load('capture',HERE/'controlled-snapshot-backup.py')
r=load('restore',HERE/'controlled-snapshot-restore.py')


class SnapshotMode(unittest.TestCase):
    def packet(self):
        t=m.cap.now();end=t+m.timedelta(hours=1)
        a={'approvalId':'5f119b16-5127-4087-8d91-c8800cc06c38','target':m.plan.REF,'organization':m.plan.ORGANIZATION,
           'mode':m.MODE,'codeSha256':m.code_hash(),'approvedBy':'JT','actions':m.ACTIONS,'pointOnlyNoLiveRestoreOrDispatch':True,'decisionEvidence':{'chosenBy':'Main','scheme':'B','evidenceRef':'SYNTHETIC_ONLY_NOT_AUTHORITY','evidenceSha256':'0'*64},
           'exporterLifetimeSeconds':60,'windowStart':(t-m.timedelta(minutes=1)).isoformat(),'windowEnd':end.isoformat(),
           'retainUntil':(t+m.timedelta(days=1)).isoformat(),'restoreDestination':'SYNTHETIC_ONLY',
           'archiveDirectory':m.plan.ARCHIVE_ROOT,'identityDirectory':m.plan.IDENTITY_ROOT,
           'catalogBoundaryConfirmations':{key:{'confirmed':True,'owner':'SYNTHETIC_TEST_OWNER','evidenceRef':'SYNTHETIC_ONLY_NOT_APPROVAL','evidenceSha256':'0'*64,'validFrom':(t-m.timedelta(minutes=1)).isoformat(),'validUntil':end.isoformat()} for key in m.BOUNDARIES}}
        official=json.loads((m.cap.ROOT/'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_text())
        official.update(project=m.plan.REF,link_id=m.plan.ACCOUNT['link_id'],observedAt=t.isoformat())
        return a,official,t

    def test_default_capture_restore_have_no_external_io(self):
        with patch.object(m.cap.probe,'checked',side_effect=AssertionError('forbidden')),patch.object(m.protocol.subprocess,'Popen',side_effect=AssertionError('forbidden')):
            self.assertEqual(m.main([])['status'],'DRY_RUN_NO_TARGET_IO')
            self.assertEqual(r.main([])['status'],'DRY_RUN_NO_ARCHIVE_OR_DOCKER_IO')

    def test_both_execute_paths_require_human_tty(self):
        with patch.object(m.sys.stdin,'isatty',return_value=False):
            with self.assertRaises(ValueError):m.main(['--snapshot-execute','not-read','not-read'])
            with self.assertRaises(ValueError):r.main(['--restore-snapshot-approved','not-read','not-read','not-read'])

    def test_concrete_authority_and_catalog_boundaries_required(self):
        a,o,t=self.packet();m.validate_gate(a,o,t)
        self.assertNotIn('writersAndMigratorsQuiesced',a)
        for key,value in [('mode','strict'),('codeSha256','old'),('approvedBy','agent'),('actions',m.cap.APPROVAL_ACTIONS),('pointOnlyNoLiveRestoreOrDispatch',False),('decisionEvidence',{}),('catalogBoundaryConfirmations',{}),('exporterLifetimeSeconds',601)]:
            changed=copy.deepcopy(a);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_gate(changed,o,t)

    def test_expired_observation_window_or_owner_evidence_rejected(self):
        a,o,t=self.packet()
        with self.assertRaises(ValueError):m.validate_gate(a,o,t+m.timedelta(minutes=6))
        with self.assertRaises(ValueError):m.validate_gate(a,o,t+m.timedelta(minutes=50))
        a['catalogBoundaryConfirmations'][m.BOUNDARIES[0]]['confirmed']=False
        with self.assertRaises(ValueError):m.validate_gate(a,o,t)

    def test_catalog_drift_does_not_use_imported_old_values(self):
        with self.assertRaisesRegex(ValueError,'SNAPSHOT_CATALOG_BOUNDARY_CHANGED'):
            m.contract.assert_evidence_stable({'roles':False},{'roles':True})

    def test_original_restore_cannot_silently_accept_mode_b(self):
        with self.assertRaises(ValueError):r.base.bundle_preflight({'verification':{'contract':r.RESTORE_CONTRACT}})
        with self.assertRaises(ValueError):r.verify_manifest({'captureMode':m.MODE,'verification':{'contract':r.RESTORE_CONTRACT,'sharedSnapshot':{}}})

    def test_snapshot_dump_argument_is_mandatory(self):
        class Fake:
            snapshot='00000001-00000001-1'
            def checkpoint(self):pass
        with self.assertRaisesRegex(ValueError,'SNAPSHOT_DUMP_ARGUMENT_REQUIRED'):
            m.protocol.seal_guarded(['never-exec'],{},'never-read',Path('never-created'),Fake())

    def test_unknown_sequence_profiles_fail_before_max_query(self):
        spec={'schema':'public','name':'s','increment':1,'min':1,'max':100,'cycle':False,'tableSchema':'public','table':'t','column':'id','columnType':'bigint'}
        for key,value in [('cycle',True),('increment',-1),('tableSchema',None),('columnType','text')]:
            changed={**spec,key:value}
            class FakeExporter:
                calls=0
                def imported(self,sql):
                    self.calls+=1
                    if self.calls>1:raise AssertionError('max query forbidden')
                    return [json.dumps([changed])]
            fake=FakeExporter()
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'UNSUPPORTED_SEQUENCE_SAFETY_PROFILE'):m.contract.sequence_expectations(fake)
            self.assertEqual(fake.calls,1)

    def test_sequence_exhaustion_fails_without_nextval_or_repair(self):
        spec={'schema':'public','name':'s','increment':1,'min':1,'max':2,'cycle':False,'tableSchema':'public','table':'t','column':'id','columnType':'bigint','snapshotMax':2}
        class FakeDb:
            def sql(self,sql):
                if 'pg_sequence' in sql:return json.dumps([{k:v for k,v in spec.items() if k!='snapshotMax'}])
                if 'last_value' in sql:return json.dumps({'last':2,'called':True})
                self_outer.assertNotIn('nextval(',sql);self_outer.assertNotIn('setval(',sql)
                return '2'
        self_outer=self
        with self.assertRaisesRegex(ValueError,'RESTORED_SEQUENCE_NEXT_VALUE_UNSAFE'):m.contract.verify_restored_sequences(FakeDb(),[spec])

    def test_static_original_source_and_no_fabricated_quiescence(self):
        source=(HERE/'controlled-snapshot-backup.py').read_text()
        self.assertNotIn("'writersAndMigratorsQuiesced':True",source)
        original=(HERE/'controlled-backup.py').read_text()
        self.assertIn("a.get('writersAndMigratorsQuiesced') is True",original)
        self.assertNotIn('shared-readonly-snapshot/1',original)


if __name__=='__main__':unittest.main(verbosity=2)
