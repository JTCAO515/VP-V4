import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime,timezone,timedelta
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('authority',HERE/'direct-human-authority.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class DirectAuthority(unittest.TestCase):
    def setUp(self):self.record,self.digest=m.read_private(m.AUTHORITY_FILE)
    def test_direct_capture_skips_tty_but_requires_authority_before_io(self):
        spec=importlib.util.spec_from_file_location('cap_cli',HERE/'controlled-snapshot-backup.py');cap=importlib.util.module_from_spec(spec);spec.loader.exec_module(cap)
        with patch.object(Path,'read_text',return_value='{}'),patch.object(cap,'validate_gate'),patch.object(cap.authority,'validate_packet',side_effect=ValueError('DIRECT_MAIN_REVIEW_START_MISSING')),patch.object(cap,'execute',side_effect=AssertionError('no target IO')),patch('builtins.input',side_effect=AssertionError('no fake human TTY')):
            with self.assertRaisesRegex(ValueError,'DIRECT_MAIN_REVIEW_START_MISSING'):cap.main(['--snapshot-from-direct-record','packet','fresh'])

    def test_direct_restore_skips_tty_but_requires_authority_before_io(self):
        spec=importlib.util.spec_from_file_location('restore_cli',HERE/'controlled-snapshot-restore.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
        packet={'mode':r.MODE,'codeSha256':r.code_hash(),'actions':['decrypt-approved-bundle','restore-own-isolated-docker','verify-no-content-output','destroy-own-restored-copy','restore-realtime-schema-migrations-ledger','verify-monotone-sequence-no-collision','replay-reviewed-missing80-owned-copy'],'replayMode':r.replay.MODE,'replayManifestSha256':r.replay.MANIFEST_HASH}
        import json
        with patch.object(Path,'read_text',return_value=json.dumps(packet)),patch.object(r,'verify_manifest'),patch.object(r.replay,'load_plan'),patch.object(r.base,'validate_approval'),patch.object(r.authority,'validate_packet',side_effect=ValueError('DIRECT_MAIN_REVIEW_START_MISSING')),patch.object(r,'restore_bundle',side_effect=AssertionError('no archive or Docker IO')),patch('builtins.input',side_effect=AssertionError('no fake human TTY')):
            with self.assertRaisesRegex(ValueError,'DIRECT_MAIN_REVIEW_START_MISSING'):r.main(['--restore-replay-from-direct-record','packet','manifest','identity','plan'])

    def test_actual_record_contains_direct_item_question_answer(self):
        m.validate_human_record(self.record,self.digest)
    def test_relay_or_technical_choice_cannot_replace_human(self):
        for key,value in [('source','Root relay or Main technical selection'),('humanAnswer','Main selected B'),('questionItemId','null'),('target','other'),('scopeGroups',['A','B','C','D','E'])]:
            changed=copy.deepcopy(self.record);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_human_record(changed,self.digest)
    def test_record_hash_changes_fail(self):
        with self.assertRaisesRegex(ValueError,'DIRECT_HUMAN_RECORD_HASH_CHANGED'):m.validate_human_record(self.record,'0'*64)
    def test_unapproved_packet_rejects_before_main_start(self):
        with patch.object(m,'read_private',return_value=(self.record,self.digest)):
            with self.assertRaisesRegex(ValueError,'DIRECT_PACKET_UNAPPROVED'):
                m.validate_packet({'humanAuthorizationRecordSha256':self.digest,'target':m.TARGET,'codeSha256':'code','approvedBy':None,'proposalOnly':True},'capture','code',datetime.now(timezone.utc),datetime.fromisoformat)
    def test_private_record_permission_gate(self):
        with tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='direct-authority-test-') as tmp:
            p=Path(tmp)/'record';p.write_text('{}');os.chmod(p,0o644)
            with self.assertRaisesRegex(ValueError,'DIRECT_AUTHORITY_FILE_UNSAFE'):m.read_private(p)
    def test_only_main_reviewed_stage_code_uuid_can_start(self):
        t=datetime.now(timezone.utc);end=t+timedelta(hours=1)
        packet={'humanAuthorizationRecordSha256':self.digest,'target':m.TARGET,'codeSha256':'code','approvedBy':'JT','retainUntil':self.record['retainUntil'],'windowStart':t.isoformat(),'windowEnd':end.isoformat(),'approvalId':'id','mainStartReceiptSha256':'s'*64}
        start={'status':'MAIN_REVIEWED_EXECUTION_START','issuedBy':'Main','target':m.TARGET,'humanAuthorizationRecordSha256':self.digest,'allowedStages':['capture'],'approvalId':'id','codeHashes':{'capture':'code'},'validFrom':t.isoformat(),'validUntil':end.isoformat(),'reviewedSourceCommit':'a'*40}
        with patch.object(m,'read_private',side_effect=lambda p:(self.record,self.digest) if p==m.AUTHORITY_FILE else (start,'s'*64)),patch.object(Path,'exists',return_value=True):
            m.validate_packet(packet,'capture','code',t,datetime.fromisoformat)
            with self.assertRaisesRegex(ValueError,'DIRECT_MAIN_STAGE_CODE_UUID_CHANGED'):m.validate_packet(packet,'restore-replay','code',t,datetime.fromisoformat)


if __name__=='__main__':unittest.main(verbosity=2)
