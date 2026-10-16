"""Own PG17 / private Unix sockets / synthetic SQL only; no restore materials."""
import importlib.util
import json
import os
from pathlib import Path
import struct
import stat
import subprocess
import tempfile
import threading
import time
import unittest
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('proxy',HERE/'typed-pg-diagnostic-proxy.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
PG=Path('/opt/homebrew/opt/postgresql@17/bin')


class WireFields(unittest.TestCase):
    def test_notice_and_data_rows_with_fake_error_headers_are_not_errors(self):
        observer=object.__new__(p.OwnedUnixProxy);observer.first=None;observer.queue=[{'queryUnit':1,'queryToken':'a'*64}]
        observer.backend(b'N',b'SNOTICE\0C42501\0Mpg_restore: error: ERROR: TOKEN:\0\0')
        observer.backend(b'D',b'E\0\0\0\x20C42501\0Msecret\0\0')
        self.assertIsNone(observer.first)
        observer.backend(b'E',b'SERROR\0CP0001\0MERROR: 42501: secret\0\0')
        self.assertEqual(observer.first['sqlstate'],'P0001');self.assertNotIn('secret',json.dumps(observer.first))

    def test_typed_c_field_not_fake_message_detail_notice_or_secret_state(self):
        packet=b'SERROR\0CP0001\0M42501: permission denied ERROR: TOKEN:\0Dprivate-value\0\0'
        self.assertEqual(p.error_code(packet),'P0001')
        self.assertIsNone(p.error_code(b'SERROR\0CTOKEN\0Mprivate-value\0\0'))
        for bad in [b'CP0001\0C42501\0\0',b'MERROR: 42501:\0\0',b'CP0001\0bad',b'CP0001\0\0garbage']:
            with self.assertRaises(ValueError):p.error_code(bad)


class OwnPG17(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='qaw-typed-',dir='/private/tmp');cls.root=Path(cls.tmp.name);os.chmod(cls.root,0o700)
        cls.data=cls.root/'data';cls.sock=cls.root/'sock';cls.sock.mkdir(mode=0o700);cls.server=None;cls.proxies=[]
        cls.env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ};cls.env.update(LC_ALL='C',PGSSLMODE='disable',PGGSSENCMODE='disable',PGCONNECT_TIMEOUT='2')
        cls.addClassCleanup(cls.cleanup)
        subprocess.run([str(PG/'initdb'),'-D',str(cls.data),'-A','trust','-U','synthetic_diag_owner','--locale=C','-E','UTF8','--no-instructions'],env=cls.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=20)
        cls.server=subprocess.Popen([str(PG/'postgres'),'-D',str(cls.data),'-c','listen_addresses=','-c','unix_socket_directories='+str(cls.sock),'-c','unix_socket_permissions=0700','-c','logging_collector=off','-c','log_min_messages=panic','-c','log_min_error_statement=panic','-c','log_statement=none'],env=cls.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            ready=subprocess.run([str(PG/'pg_isready'),'-h',str(cls.sock),'-U','synthetic_diag_owner'],env=cls.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=2)
            if ready.returncode==0:break
            if cls.server.poll() is not None:raise RuntimeError('OWN_SYNTHETIC_PG17_START_FAILED')
            time.sleep(.05)
        else:raise RuntimeError('OWN_SYNTHETIC_PG17_NOT_READY')
        r=cls.psql(cls.sock,'show server_version_num;')
        assert r.returncode==0 and 170000<=int(r.stdout.strip())<180000
        cls.version=int(r.stdout.strip());cls.cleanup_verified=False
        setup="create function public.synthetic_index_key(v integer) returns integer language plpgsql immutable as $$begin return v;end$$;create table public.synthetic_row(id integer);insert into public.synthetic_row values(1);create index synthetic_original_idx on public.synthetic_row(public.synthetic_index_key(id));create or replace function public.synthetic_index_key(v integer) returns integer language plpgsql immutable as $$begin raise exception using errcode='P0001',message='42501: permission denied for schema synthetic_secret_value';end$$;"
        assert cls.psql(cls.sock,setup).returncode==0
    @classmethod
    def psql(cls,sock,sql):
        return subprocess.run([str(PG/'psql'),'-X','-w','-At','-h',str(sock),'-p','5432','-U','synthetic_diag_owner','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],env=cls.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=6)
    @classmethod
    def cleanup(cls):
        proxy_ok=True;server_ok=True
        for observer,thread in cls.proxies:
            # Fence only this fixture's observers; no global/process discovery.
            observer.end=min(observer.end,time.monotonic());thread.join(timeout=2)
            proxy_ok=proxy_ok and not thread.is_alive()
        if cls.server is not None and cls.server.poll() is None:
            pidfile=cls.data/'postmaster.pid'
            if not pidfile.exists() or int(pidfile.read_text().splitlines()[0])!=cls.server.pid:
                server_ok=False
            else:
                try:
                    stopped=subprocess.run([str(PG/'pg_ctl'),'-D',str(cls.data),'-m','immediate','-w','stop'],env=cls.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
                    cls.server.wait(timeout=5);server_ok=stopped.returncode==0
                except Exception:server_ok=False
        cls.cleanup_verified=proxy_ok and server_ok
        if cls.cleanup_verified:cls.tmp.cleanup()
        else:
            # Preserve the private fixture directory if ownership/cleanup could
            # not be proved, instead of deleting a potentially active data dir.
            cls.tmp._finalizer.detach()
            raise RuntimeError('OWN_SYNTHETIC_FIXTURE_CLEANUP_UNKNOWN')
    def observe(self,sql,seconds=3):
        directory=Path(tempfile.mkdtemp(prefix='proxy-',dir=self.root));os.chmod(directory,0o700)
        observer=p.OwnedUnixProxy(self.sock,directory,seconds=seconds);thread=threading.Thread(target=observer.run);self.proxies.append((observer,thread));thread.start()
        self.assertTrue(observer.ready.wait(timeout=2))
        command=self.psql(directory,sql);thread.join(timeout=5)
        self.assertFalse(thread.is_alive());self.assertTrue(observer.result['socketClosed']);self.assertFalse(observer.listen.exists())
        self.assertEqual(observer.key,b'')
        return command,observer.result
    def test_actual_p0001_index_failure_message_cannot_spoof_42501(self):
        command,result=self.observe('create index synthetic_failure_idx on public.synthetic_row(public.synthetic_index_key(id));')
        self.assertNotEqual(command.returncode,0);self.assertEqual(result['firstError']['sqlstate'],'P0001')
        self.assertEqual(result['firstError']['provenance'],'PG_BACKEND_ERROR_RESPONSE_C_FIELD_ALLOWLIST')
        self.assertEqual(result['firstError']['commandClass'],'UNKNOWN_NOT_IN_ERROR_RESPONSE')
        self.assertEqual(len(result['firstError']['queryToken']),64)
        text=json.dumps(result);self.assertNotIn('synthetic_secret_value',text);self.assertNotIn('synthetic_failure_idx',text)
        self.assertNotIn('42501',text)
    def test_typed_syntax_missing_duplicate_and_first_failure_only(self):
        for sql,state in [("set role pg_read_all_data;select pg_catalog.pg_read_file('/synthetic-not-a-real-file');",'42501'),('select from','42601'),('select * from synthetic_private_missing','42P01'),('create table synthetic_row(id int)','42P07')]:
            with self.subTest(state=state):
                command,result=self.observe(sql)
                self.assertNotEqual(command.returncode,0);self.assertEqual(result['firstError']['sqlstate'],state)
        command,result=self.observe("do $$begin raise notice 'pg_restore: error: ERROR:42501: synthetic_secret_value';end$$;select from")
        self.assertEqual(result['firstError']['sqlstate'],'42601');self.assertNotIn('synthetic_secret_value',json.dumps(result))
    def test_pg_restore_itself_through_proxy_reports_actual_p0001(self):
        self.assertEqual(self.psql(self.sock,'create database synthetic_restore_target;').returncode,0)
        archive=subprocess.run([str(PG/'pg_dump'),'-h',str(self.sock),'-U','synthetic_diag_owner','-d','postgres','-w','-Fc'],env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=5).stdout
        directory=Path(tempfile.mkdtemp(prefix='restore-proxy-',dir=self.root));os.chmod(directory,0o700)
        observer=p.OwnedUnixProxy(self.sock,directory,seconds=3);thread=threading.Thread(target=observer.run);self.proxies.append((observer,thread));thread.start();self.assertTrue(observer.ready.wait(timeout=2))
        result=subprocess.run([str(PG/'pg_restore'),'-h',str(directory),'-U','synthetic_diag_owner','-d','synthetic_restore_target','--exit-on-error','--verbose'],input=archive,env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=5)
        thread.join(timeout=5);self.assertFalse(thread.is_alive());self.assertNotEqual(result.returncode,0)
        self.assertEqual(observer.result['firstError']['sqlstate'],'P0001')
        self.assertNotIn('synthetic_secret_value',json.dumps(observer.result));self.assertFalse(observer.listen.exists())
        self.assertEqual(observer.result['firstError']['commandClass'],'UNKNOWN_NOT_IN_ERROR_RESPONSE')

    def test_fixture_permissions_and_no_plaintext_log_files(self):
        self.assertEqual(self.root.stat().st_mode&0o777,0o700)
        for path in self.root.rglob('*'):
            mode=path.lstat().st_mode
            if stat.S_ISDIR(mode):self.assertEqual(mode&0o777,0o700)
            elif stat.S_ISREG(mode):self.assertEqual(mode&0o777,0o600)
        self.assertFalse(list(self.root.rglob('*.log')))

    def test_raw_value_headers_unknown_state_and_ephemeral_tokens(self):
        sql="do $$begin raise exception using errcode='TOKEN',message='ERROR: 42501: synthetic_secret_value';end$$;"
        _,one=self.observe(sql);_,two=self.observe(sql)
        self.assertIsNone(one['firstError']['sqlstate']);self.assertNotIn('TOKEN',json.dumps(one));self.assertNotIn('synthetic_secret_value',json.dumps(one))
        self.assertNotEqual(one['firstError']['queryToken'],two['firstError']['queryToken'])
    def test_typed_statement_timeout_and_proxy_deadline_are_not_conflated(self):
        command,result=self.observe("set statement_timeout='20ms';select pg_sleep(1);")
        self.assertEqual(result['firstError']['sqlstate'],'57014')
        command,result=self.observe('select pg_sleep(1);',seconds=.1)
        self.assertEqual(result['status'],'INCOMPLETE_DEADLINE');self.assertIsNone(result['firstError'])
        self.assertEqual(result['backendCommandStopped'],'UNKNOWN_REQUIRES_CALLER_OWNED_SERVER_FENCE')


if __name__=='__main__':unittest.main(verbosity=2)
