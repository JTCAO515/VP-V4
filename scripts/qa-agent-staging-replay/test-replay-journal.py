import importlib.util
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('hook',HERE/'owned-replay-hook.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
VERSIONS=['20261016000001','20261016000002']
ACL={'exists':True,'service':True,'anon':False,'authenticated':False,'public':False}


def run(module,stop=None,journal=True,candidate=False,port_values=None):
    class Db:
        name='synthetic-owned';nonce='nonce';created=True
        def __init__(self):
            self.done=[];self.calls=[]
            if journal:self._window_replay_progress={}
        def docker(self,args):return json.dumps([{'Config':{'Labels':{'qaw.restore.owner':self.nonce}},'HostConfig':{'NetworkMode':'none','PortBindings':None},'Mounts':[]}]).encode()
        def sql(self,sql):
            self.calls.append(sql)
            if "proname like 'qa_%'" in sql:return '0'
            if 'insert into supabase_migrations.schema_migrations' in sql:
                self.done.append(re.search(r"values\('([0-9]+)'",sql)[1]);return ''
            if module.GATES[0] in sql:return json.dumps({k:True for k in module.GATES})
            if "'exists',to_regprocedure(" in sql:
                if stop=='before-acl':raise KeyboardInterrupt()
                return json.dumps(ACL)
            if sql.startswith("select to_regprocedure('public.qa_submit_message_v1"):
                if stop=='after-acl':raise KeyboardInterrupt()
                return 't'
            if sql=='select enabled from turn_private.hosted_worker_control;':return 'f'
            if 'pg_catalog.pg_proc p on p.oid=r.oid' in sql:
                name=next(name for name,sig in module.RUNTIME_PORTS if sig in sql)
                return json.dumps((port_values or {}).get(name,module.RUNTIME_PORT_EXPECTED))
            return 'a'*64
    db=Db();plan={'mode':module.CANDIDATE_MODE if candidate else module.MODE,'baselineVersions':[],'expectedVersions':VERSIONS,'reviewedMissing':VERSIONS,'sourceHead':'1'*40,'manifestSha256':'2'*64}
    sources=[{'version':v,'file':v+'_synthetic.sql','sql':'begin;select 1;commit;'} for v in VERSIONS]
    fingerprints={'public.synthetic':{'count':0,'sha256':'3'*64,'digests':{}}}
    outcome=None
    with patch.object(module,'load_plan',return_value=(plan,sources)),patch.object(module,'versions',side_effect=lambda db:list(db.done)),patch.object(module,'retained_data',return_value=[{'schema':'public','table':'synthetic','columns':['id']}]),patch.object(module,'fingerprints',return_value=fingerprints),patch.object(module,'source_guard_diagnostics',side_effect=lambda db,item:{'guardVersion':item['version'],'bodyMd5':'4'*32}):
        try:outcome=module.replay_owned(db,'not-read')
        except KeyboardInterrupt:pass
    return db,outcome


class ReplayJournal(unittest.TestCase):
    def test_completed_verification_facts_survive_interrupt_before_acl(self):
        db,outcome=run(h,'before-acl');self.assertIsNone(outcome);j=db._window_replay_progress
        self.assertEqual(j['appliedVersions'],VERSIONS);self.assertIsNone(j['inflightVersion'])
        self.assertTrue(j['baselineLedgerValidated']);self.assertTrue(j['finalLedgerValidated']);self.assertTrue(j['baselineHistoryPreserved'])
        self.assertEqual(j['baselineHistoryBeforeSha256'],'a'*64);self.assertEqual(j['retainedRelations'],1)
        self.assertEqual(j['retentionDifferences'],[]);self.assertTrue(j['retainedOriginalColumnRows'].startswith('PASS_'))
        self.assertEqual(j['lifecycleGates'],{k:True for k in h.GATES})
        self.assertEqual(set(j['sourceGuardDiagnostics']),set(VERSIONS));self.assertNotIn('qaV2Acl',j)
        self.assertNotIn('digests',json.dumps(j));self.assertNotIn('select 1',json.dumps(j))

    def test_acl_observation_survives_interrupt_before_next_interface(self):
        db,outcome=run(h,'after-acl');self.assertIsNone(outcome)
        self.assertEqual(db._window_replay_progress['qaV2Acl'],ACL)
        self.assertNotIn('requiredInterfacesValidated',db._window_replay_progress)
        self.assertFalse(db._window_replay_progress['automaticRetryAllowed'])

    def test_no_journal_preserves_legacy_outcome(self):
        db,result=run(h,journal=False)
        self.assertFalse(hasattr(db,'_window_replay_progress'))
        self.assertEqual(result['status'],'PASS_OWNED_RESTORED_REPLAY_ONLY')
        self.assertEqual(result['appliedMissingVersions'],VERSIONS)
        self.assertNotIn('baselineLedgerValidated',result);self.assertNotIn('inflightVersion',result)
        db2,result2=run(h)
        self.assertEqual(result,result2)
        self.assertEqual(db2._window_replay_progress['stage'],'REPLAY_COMPLETE')
        self.assertTrue(db2._window_replay_progress['requiredInterfacesValidated'])
        self.assertTrue(db2._window_replay_progress['hostedSwitchDisabled'])


if __name__=='__main__':unittest.main(verbosity=2)
