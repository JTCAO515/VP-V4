import ast
import copy
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('candidate', HERE / 'backup-candidate.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BASE = m.ROOT / 'artifacts/QAWEB/staging-replay'


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((BASE / 'observed.json').read_text())
        self.metadata = json.loads((BASE / 'target-metadata.json').read_text())
        self.observation = dict(account=m.ACCOUNT, project=m.REF, organization=m.ORGANIZATION,
                                status='ACTIVE_HEALTHY', postgres_version='17.6.1.155',
                                versions=self.snapshot['applied'], business_schemas=self.metadata['schemas'],
                                data_schemas=list(m.SCHEMAS))

    def test_dry_run(self):
        p = m.main(['--dry-run'])
        self.assertEqual(len(p['dataSchemas']), 14)
        self.assertEqual(p['encryptedBackup'], 'UNRUN')
        self.assertEqual(p['targetRead'], 'UNRUN')
        self.assertNotIn('--no-privileges', p['dumpArgvTemplate'])
        self.assertNotIn('--no-owner', p['dumpArgvTemplate'])
        self.assertTrue(all(not v.startswith('--role=') for v in p['dumpArgvTemplate']))

    def test_execution_and_external_inputs_rejected(self):
        for args in ([], ['--execute'], ['--dry-run', '--execute'], ['--dry-run', '/tmp/other.json']):
            with self.subTest(args=args), self.assertRaises(ValueError):
                m.main(args)

    def test_migrations_exact_not_count_only(self):
        changed = self.snapshot['applied'][:]
        changed[0] = '20260824101501'
        for versions in (changed, changed[:-1], changed + [changed[-1]], list(reversed(changed)), None):
            with self.subTest(versions_type=type(versions).__name__), self.assertRaises(ValueError):
                m.validate_versions(versions)

    def test_schema_unknown_or_missing_or_duplicate_rejected(self):
        schemas = self.metadata['schemas']
        for value in (schemas[:-1], schemas + ['unknown_private'], schemas + [schemas[0]], None):
            with self.assertRaises(ValueError):
                m.validate_business_schemas(value)

    def test_metadata_contract_fail_closed(self):
        m.validate_live_metadata_shape(self.observation)  # Shape only, never live evidence.
        for key, value in [('account', {'name': 'Supabase'}), ('project', 'other'),
                           ('organization', 'other'), ('status', 'PAUSED'),
                           ('postgres_version', '17.6.1.159'), ('data_schemas', list(m.SCHEMAS)[:-1])]:
            altered = copy.deepcopy(self.observation)
            altered[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.validate_live_metadata_shape(altered)

    def test_static_no_network_process_write_or_credentials(self):
        tree = ast.parse((HERE / 'backup-candidate.py').read_text())
        allowed = {'hashlib', 'json', 'pathlib', 'sys'}
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                self.assertTrue(all(x.name in allowed for x in n.names))
            if isinstance(n, ast.ImportFrom):
                self.assertIn(n.module, allowed)
            if isinstance(n, ast.Call):
                if isinstance(n.func, ast.Name):
                    self.assertNotIn(n.func.id, {'eval', 'exec', 'open', '__import__'})
                if isinstance(n.func, ast.Attribute):
                    self.assertNotIn(n.func.attr, {'mkdir', 'write_text', 'write_bytes', 'unlink', 'chmod',
                                                  'connect', 'urlopen', 'Popen', 'run', 'system'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
