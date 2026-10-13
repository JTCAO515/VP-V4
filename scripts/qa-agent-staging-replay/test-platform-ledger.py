import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('ledger',HERE/'platform-ledger.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class PlatformLedgerTests(unittest.TestCase):
    def setUp(self):
        self.observation=json.loads((HERE.parents[1]/'artifacts/QAWEB/staging-replay/platform-count-observation.json').read_text())
        catalog={c['relation']:c for c in self.observation['catalog']}
        self.relations=[{**r,'columns':catalog[r['schema']+'.'+r['name']]['columns']} for r in self.observation['inventory']]

    def test_real_count_observation_defeats_old_zero_gate(self):
        counts=self.observation['counts']
        self.assertFalse(all(v==0 for v in counts.values()))
        self.assertEqual(counts[m.RELATION],89)
        m.validate(counts,self.relations)

    def test_count_drift_or_service_content_rejected(self):
        for name,value,error in [(m.RELATION,0,'PLATFORM_LEDGER_COUNT_CHANGED'),(m.RELATION,90,'PLATFORM_LEDGER_COUNT_CHANGED'),('vault.secrets',1,'UNCOVERED_PLATFORM_DATA_NOT_EMPTY'),('realtime.subscription',1,'UNCOVERED_PLATFORM_DATA_NOT_EMPTY'),('realtime.messages',1,'UNCOVERED_PLATFORM_DATA_NOT_EMPTY')]:
            altered=self.observation['counts'].copy();altered[name]=value
            with self.subTest(name=name,value=value),self.assertRaisesRegex(ValueError,error):m.validate(altered,self.relations)

    def test_unknown_or_changed_platform_relation_rejected(self):
        altered=self.observation['counts'].copy();altered['realtime.other']=0
        with self.assertRaisesRegex(ValueError,'PLATFORM_RELATION_SET_CHANGED'):m.validate(altered,self.relations)
        for field,value in [('owner','unknown'),('columns',[]),('kind','p')]:
            rels=copy.deepcopy(self.relations)
            next(r for r in rels if r['schema']+'.'+r['name']==m.RELATION)[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):m.validate(self.observation['counts'],rels)

    def test_capture_does_not_read_ledger_values_before_profile_and_count_pass(self):
        spec=importlib.util.spec_from_file_location('capture',HERE/'controlled-backup.py')
        capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
        metadata={'relations':[],'platform_relations':copy.deepcopy(self.relations)}
        next(r for r in metadata['platform_relations'] if r['schema']+'.'+r['name']==m.RELATION)['owner']='unknown'
        with patch.object(capture.probe,'checked',side_effect=AssertionError('query forbidden')) as query:
            with self.assertRaisesRegex(ValueError,'PLATFORM_RELATION_PROFILE_CHANGED'):capture.restore_expectations({},1,metadata)
            query.assert_not_called()
        metadata['platform_relations']=self.relations
        changed=self.observation['counts'].copy();changed[m.RELATION]=90
        with patch.object(capture.probe,'checked',return_value='{}\n'+json.dumps(changed)) as query:
            with self.assertRaisesRegex(ValueError,'PLATFORM_LEDGER_COUNT_CHANGED'):capture.restore_expectations({},1,metadata)
            query.assert_called_once()
            self.assertNotIn('string_agg',query.call_args.kwargs['stdin'])

    def test_descriptor_requires_explicit_exact_supplement(self):
        m.validate_descriptor(m.descriptor('0'*64))
        for supplement in [None,{},dict(m.descriptor('0'*64),rowCount=0),dict(m.descriptor('0'*64),archiveFile='other')]:
            with self.assertRaises(ValueError):m.validate_descriptor(supplement)

    def test_supplement_toc_cannot_include_service_rows(self):
        toc='1; 0 1 TABLE DATA realtime schema_migrations supabase_admin\n'
        m.validate_toc(toc)
        for altered in ['',toc+'2; 0 2 TABLE DATA realtime messages supabase_realtime_admin\n',toc.replace('schema_migrations','subscription')]:
            with self.assertRaisesRegex(ValueError,'PLATFORM_LEDGER_TOC_CONFLICT'):m.validate_toc(altered)


if __name__=='__main__':unittest.main(verbosity=2)
