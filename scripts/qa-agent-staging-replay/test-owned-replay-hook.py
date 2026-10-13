import importlib.util
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('hook',HERE/'owned-replay-hook.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


spec=importlib.util.spec_from_file_location('compat',HERE/'replay-restore-compat.py');compat=importlib.util.module_from_spec(spec);spec.loader.exec_module(compat)


class HookTests(unittest.TestCase):
    def test_unknown_schema_and_acl_remain_rejected(self):
        unknown=compat.ORIGINAL.replace('not_relevant','unknown_reason')
        self.assertEqual(compat.normalized([(compat.HEADER,unknown)]),[(compat.HEADER,unknown)])
        class Db:
            created=True
            def sql(self,sql):
                if 'grant' in sql:raise AssertionError('unknown ACL must not be repaired')
                return '{anon=r/postgres}'
        with self.assertRaisesRegex(ValueError,'UNKNOWN_ARCHIVED_TABLE_ACL_DRIFT'):
            compat.restore_archived_owner_maintain(Db(),{'relations':[{'schema':'public','name':'x','kind':'r','owner':'postgres','acl':'{postgres=arwdDxtm/postgres}'}]})

    def test_default_acl_repair_is_bounded_and_verified(self):
        expected={'owner':'postgres','schema':'GLOBAL','type':'r','acl':'{postgres=arwdDxtm/postgres}'}
        stale={**expected,'acl':'{postgres=arwdDxt/postgres}'}
        class Db:
            grants=0
            def sql(self,sql):
                if sql.startswith('begin;'):self.grants+=1;return ''
                return json.dumps([stale])
        db=Db()
        with self.assertRaisesRegex(ValueError,'ARCHIVED_DEFAULT_ACL_NOT_RESTORED'):
            compat.verify_restore_default_acl(db,{'default_acl':[expected]})
        self.assertEqual(db.grants,1)

    def test_registration_stays_inside_original_transaction(self):
        item={'version':'20261013050429','file':'20261013050429_qa_agent_web.sql','sql':'begin;\ncreate function f() returns void language plpgsql as $$begin perform 1;end$$;\ncommit;'}
        sql=m.migration_transaction(item)
        self.assertLess(sql.index('insert into supabase_migrations'),sql.rindex('commit;'))
        self.assertEqual(len([s for s in m.top_statements(sql) if s[2]=='BEGIN']),1)

    def test_unknown_transaction_layout_is_not_wrapped_as_atomic(self):
        for sql in ['begin;commit;begin;select 1;commit;','select 1;commit;','begin;select 1;']:
            with self.assertRaisesRegex(ValueError,'REPLAY_TRANSACTION_LAYOUT_UNSUPPORTED'):
                m.migration_transaction({'version':'20261013050429','file':'20261013050429_qa.sql','sql':sql})

    def test_source_manifest_drift_fails_before_source_load(self):
        with tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='replay-manifest-test-') as tmp:
            path=Path(tmp)/'changed.json';path.write_text('{}')
            with patch.object(m,'git_read',side_effect=AssertionError('must not load')):
                with self.assertRaisesRegex(ValueError,'REPLAY_MANIFEST_DRIFT'):m.load_plan(path)

    def test_unknown_newer_extra_baseline_refuses_before_any_migration(self):
        class Db:
            name='owned';nonce='nonce';created=True
            def docker(self,args):return json.dumps([{'Config':{'Labels':{'qaw.restore.owner':'nonce'}},'HostConfig':{'NetworkMode':'none','PortBindings':None},'Mounts':[]}]).encode()
            def sql(self,sql):
                self_outer.assertNotIn('insert into',sql)
                return '["unknown"]'
        self_outer=self
        with patch.object(m,'load_plan',return_value=({'baseline75':['expected']},[])):
            with self.assertRaisesRegex(ValueError,'REPLAY_BASELINE_UNKNOWN_NEWER_OR_EXTRA'):m.replay_owned(Db(),'not-read')


if __name__=='__main__':unittest.main(verbosity=2)
