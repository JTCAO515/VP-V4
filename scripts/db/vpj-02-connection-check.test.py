import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('connection_check', Path(__file__).with_name('vpj-02-connection-check.py'))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

class ConnectionCheckTests(unittest.TestCase):
    def test_inherited_pg_settings_are_not_used(self):
        with patch.dict(os.environ, {'PGHOST':'evil','PGSERVICE':'evil','PGSSLMODE':'disable','PGOPTIONS':'unsafe'}):
            env = check.sql_environment('test-only-secret', '/tmp/ca')
        self.assertNotIn('PGHOST', env)
        self.assertNotIn('PGSERVICE', env)
        self.assertNotIn('PGOPTIONS', env)
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGPASSWORD'], 'test-only-secret')

    def test_errors_do_not_echo_credentials_or_server_strings(self):
        for text, expected in [('password authentication failed secret', 'AUTHENTICATION_FAILED'),
                               ('certificate invalid secret','TLS_VERIFICATION_FAILED'),
                               ('connection closed secret','CONNECTION_CLOSED'),
                               ('unknown secret','CONNECTION_OR_QUERY_FAILED')]:
            self.assertEqual(check.error_kind(text), expected)

    def valid(self):
        versions = [str(20260824100000 + n) for n in range(24)]
        value = {'expectedIdentity':True, 'expectedDatabase':True, 'readOnly':True,
                 'directTripUpdateRevoked':True, 'authCount':7, 'tripCount':3, 'versions':versions}
        return versions, value

    def test_only_allowlisted_aggregate_results_escape(self):
        versions, value = self.valid()
        value['secret'] = 'must-not-be-output'
        result = check.verify_result(json.dumps(value), versions)
        self.assertNotIn('secret', result)
        self.assertNotIn('versions', result)
        self.assertEqual(result['migrationCount'],24)

    def test_identity_permissions_history_and_counts_fail_closed(self):
        for field, invalid in [('expectedIdentity',False),('expectedDatabase',False),('readOnly',False),
                               ('directTripUpdateRevoked',False),('authCount',True),('tripCount',-1),
                               ('versions',[]),('versions',['unknown']*24)]:
            versions, value = self.valid()
            value[field] = invalid
            with self.assertRaises(ValueError):
                check.verify_result(json.dumps(value),versions)

    def test_no_tls_acceptance_means_no_authentication(self):
        with patch.object(check.socket,'getaddrinfo',return_value=[]), \
             patch.object(check.ssl,'create_default_context') as context, \
             patch.object(check.socket,'create_connection') as connection:
            connection.return_value.__enter__.return_value.recv.return_value = b''
            result = check.tls_probe('example.test',5432,'ca')
            self.assertEqual(result['tls'],'FAIL')
            self.assertEqual(result['sql'],'UNRUN')
            context.return_value.wrap_socket.assert_not_called()

    def test_tls_uses_verified_hostname(self):
        with patch.object(check.socket,'getaddrinfo',return_value=[]), \
             patch.object(check.ssl,'create_default_context') as context, \
             patch.object(check.socket,'create_connection') as connection:
            connection.return_value.__enter__.return_value.recv.return_value = b'S'
            context.return_value.wrap_socket.return_value.__enter__.return_value.version.return_value = 'TLSv1.3'
            result = check.tls_probe('example.test',5432,'ca')
            self.assertEqual(result['tls'],'PASS')
            self.assertEqual(context.return_value.wrap_socket.call_args.kwargs['server_hostname'],'example.test')

if __name__ == '__main__':
    unittest.main()
