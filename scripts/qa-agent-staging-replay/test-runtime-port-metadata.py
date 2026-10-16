import importlib.util
import json
from pathlib import Path
import unittest
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('cases',HERE/'test-replay-journal.py');cases=importlib.util.module_from_spec(s);s.loader.exec_module(cases);h=cases.h


class RuntimePorts(unittest.TestCase):
    def test_candidate_only_queries_catalog_after_original_gates(self):
        db,result=cases.run(h,candidate=True)
        self.assertEqual(result['status'],'PASS_OWNED_RESTORED_REPLAY_ONLY')
        self.assertEqual(result['runtimePortMetadata'],{name:h.RUNTIME_PORT_EXPECTED for name,sig in h.RUNTIME_PORTS})
        self.assertEqual(db._window_replay_progress['runtimePortMetadata'],result['runtimePortMetadata'])
        self.assertEqual(db._window_replay_progress['stage'],'REPLAY_COMPLETE')
        queries=[sql for sql in db.calls if 'pg_catalog.pg_proc p on p.oid=r.oid' in sql]
        self.assertEqual(len(queries),2)
        last_original=db.calls.index('select enabled from turn_private.hosted_worker_control;')
        self.assertTrue(all(db.calls.index(sql)>last_original for sql in queries))
        for sql in queries:
            self.assertIn('pg_catalog.to_regprocedure',sql);self.assertIn('pg_catalog.has_function_privilege',sql)
            self.assertIn("p.proconfig=array['search_path=\"\"']::text[]",sql)
            self.assertFalse(sql.startswith('select public.qa_'));self.assertNotIn('qa_claim',sql)
            self.assertNotIn('insert into',sql);self.assertNotIn('grant ',sql.lower())

    def test_each_port_owner_definer_searchpath_execute_and_missing_negatives(self):
        for name,sig in h.RUNTIME_PORTS:
            for field,expected in h.RUNTIME_PORT_EXPECTED.items():
                observed={**h.RUNTIME_PORT_EXPECTED,field:not expected}
                with self.subTest(port=name,field=field):
                    db,result=cases.run(h,candidate=True,port_values={name:observed})
                    self.assertEqual(result['status'],'FAIL_OWNED_RESTORED_REPLAY')
                    self.assertEqual(result['reason'],'REPLAY_RUNTIME_PORT_METADATA_FAILED')
                    self.assertEqual(result['runtimePortMetadata'][name],observed)
                    self.assertEqual(db._window_replay_progress['runtimePortMetadata'][name],observed)

    def test_invalid_metadata_shape_is_not_recorded_as_fact_or_secret(self):
        name=h.RUNTIME_PORTS[0][0]
        for observed in [{'exists':True},{**h.RUNTIME_PORT_EXPECTED,'ownerIsPostgres':'private-role-or-config-value'},{**h.RUNTIME_PORT_EXPECTED,'extra':'secret'}]:
            with self.subTest(shape=tuple(observed)):
                db,result=cases.run(h,candidate=True,port_values={name:observed})
                self.assertEqual(result['reason'],'REPLAY_RUNTIME_PORT_METADATA_SHAPE')
                self.assertEqual(result['runtimePortMetadata'],{})
                self.assertNotIn('private-role',json.dumps(result));self.assertNotIn('secret',json.dumps(result))

    def test_failed_original_interface_prevents_new_port_queries(self):
        # Existing gates remain first; no discovery is made from a planned pin.
        from unittest.mock import patch
        with patch.object(h,'candidate_runtime_ports',side_effect=AssertionError('new ports before original gates')):
            # A failure of the original v2 ACL guard returns before new ports.
            old_acl=cases.ACL;cases.ACL={**old_acl,'anon':True}
            try:
                db,result=cases.run(h,candidate=True)
            finally:cases.ACL=old_acl
        self.assertEqual(result['status'],'FAIL_OWNED_RESTORED_REPLAY')
        self.assertEqual(result['reason'],'REPLAY_QA_V2_ACL_FAILED')
        self.assertEqual(result['runtimePortMetadata'],{})
        self.assertFalse(any('pg_catalog.pg_proc p on p.oid=r.oid' in sql for sql in db.calls))

    def test_legacy_query_sequence_and_shape_remain_without_new_ports(self):
        db,result=cases.run(h,candidate=False,journal=False)
        self.assertEqual(result['status'],'PASS_OWNED_RESTORED_REPLAY_ONLY')
        self.assertNotIn('runtimePortMetadata',result)
        self.assertFalse(any('pg_catalog.pg_proc p on p.oid=r.oid' in sql for sql in db.calls))


if __name__=='__main__':unittest.main(verbosity=2)
