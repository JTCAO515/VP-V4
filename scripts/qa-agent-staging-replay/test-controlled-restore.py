import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('restore',HERE/'controlled-restore.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class RestoreGates(unittest.TestCase):
    def test_default_never_reads_archive_or_starts_process(self):
        with patch.object(m.subprocess,'run',side_effect=AssertionError('process forbidden')),patch.object(m.subprocess,'Popen',side_effect=AssertionError('process forbidden')),patch.object(m.capture,'validate_ciphertext',side_effect=AssertionError('archive forbidden')):
            self.assertEqual(m.main([])['status'],'DRY_RUN_NO_ARCHIVE_OR_DOCKER_IO')
            self.assertFalse(m.main(['--dry-run'])['realArchiveRead'])

    def test_no_tty_cannot_open_real_inputs(self):
        with patch.object(m.sys.stdin,'isatty',return_value=False),patch.object(m,'restore_bundle',side_effect=AssertionError('restore forbidden')):
            with self.assertRaisesRegex(ValueError,'HUMAN_TTY_REQUIRED'):
                m.main(['--restore-approved','not-opened','not-opened','not-opened'])

    def test_legacy_capture_has_no_restore_expectations(self):
        manifest={'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':m.plan.REF,
                  'entries':[{'file':n,'sha256':'0'*64,'bytes':1} for n in m.FILES]}
        with self.assertRaisesRegex(ValueError,'RESTORE_EXPECTATIONS_MISSING'):m.bundle_preflight(manifest)

    def test_known_profile_exact_and_unknown_rejected(self):
        metadata=json.loads((m.ROOT/'artifacts/QAWEB/staging-replay/metadata-probe-04.json').read_text())['metadata']
        manifest={'status':'ENCRYPTED_CAPTURE_INTEGRITY_PASS_RESTORE_UNRUN','target':m.plan.REF,
                  'entries':[{'file':n,'sha256':'0'*64,'bytes':1} for n in m.FILES],
                  'verification':{'contract':'qaw-restore-verification/1','dataSchemas':list(m.plan.SCHEMAS),
                                  'metadata':metadata,'counts':{'synthetic-placeholder':0},'platformCounts':{},'databaseFacts':{'placeholder':'not-live'},'databaseOwner':'postgres','bootstrapRole':'supabase_admin'}}
        m.bundle_preflight(manifest)
        altered=copy.deepcopy(manifest);altered['verification']['metadata']['extensions'][0]['version']='unknown'
        with self.assertRaisesRegex(ValueError,'MANAGED_EXTENSION_PROFILE_CONFLICT'):m.bundle_preflight(altered)
        for field,value in [('owner','unknown_owner'),('schema','unknown_schema')]:
            altered=copy.deepcopy(manifest);altered['verification']['metadata']['extensions'][0][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'MANAGED_EXTENSION_PROFILE_CONFLICT'):m.bundle_preflight(altered)
        for name,value in [('postgres',True),('supabase_admin',False)]:
            altered=copy.deepcopy(manifest)
            next(role for role in altered['verification']['metadata']['roles'] if role['name']==name)['superuser']=value
            with self.subTest(role=name),self.assertRaisesRegex(ValueError,'MANAGED_ROLE_PROFILE_CONFLICT'):m.bundle_preflight(altered)
        altered=copy.deepcopy(manifest);altered['verification']['platformCounts']={'vault.secrets':1}
        with self.assertRaisesRegex(ValueError,'UNCOVERED_PLATFORM_DATA_NOT_EMPTY'):m.bundle_preflight(altered)

    def test_identifier_quoting_and_count_batching(self):
        rels=[{'schema':'odd"schema','name':'table'+str(i),'kind':'r'} for i in range(119)]
        sql=m.verify.counts_sql(rels)
        self.assertIn('"odd""schema"',sql)
        self.assertEqual(sql.count('jsonb_build_object('),3)
        self.assertEqual(sql.count('count(*)'),119)

    def test_schema_comparison_retains_owner_acl_and_source(self):
        sql='-- Name: t; Type: TABLE; Schema: public; Owner: owner\nCREATE TABLE public.t(id int);\nALTER TABLE public.t OWNER TO owner;\nGRANT SELECT ON public.t TO reader;\n\\unrestrict abc\n'
        original=m.verify.normalize_schema(sql)
        for changed in [sql.replace('OWNER TO owner','OWNER TO other'),sql.replace('TO reader','TO other'),sql.replace('id int','id text')]:
            self.assertNotEqual(original,m.verify.normalize_schema(changed))


if __name__=='__main__':unittest.main(verbosity=2)
