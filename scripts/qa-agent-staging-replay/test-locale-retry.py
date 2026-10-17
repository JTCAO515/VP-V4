import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent


def load(name):
    s=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


a=load('direct-human-authority');locale=load('owned-locale-profile');retry=load('reviewed-restore-retry')
FACTS={'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i'}
PROFILE={'databaseFacts':FACTS,'icuLocale':'en-US','icuRules':None,'collationVersion':'153.121','actualCollationVersion':'153.121'}


class LocaleRetry(unittest.TestCase):
    def test_unknown_missing_or_drifted_profile_rejects(self):
        for field,value in [('icuLocale',None),('actualCollationVersion',None),('actualCollationVersion','other'),('databaseFacts',{**FACTS,'localeProvider':'c'})]:
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):locale.validate({**PROFILE,field:value},FACTS)
        with self.assertRaises(ValueError):locale.validate({k:v for k,v in PROFILE.items() if k!='icuRules'},FACTS)
        with self.assertRaises(ValueError):locale.validate({**PROFILE,'unexpected':True},FACTS)

    def test_exact_icu_categories_and_safe_rules_bootstrap(self):
        options=locale.initdb_options(PROFILE)
        self.assertIn('--locale-provider=icu',options);self.assertIn('--icu-locale=en-US',options)
        self.assertIn('--lc-collate=en_US.UTF-8',options)
        with self.assertRaises(ValueError):locale.initdb_options({**PROFILE,'icuRules':"&a < b;$(not-a-command)'"})
        class Db:
            def sql(self,sql):return json.dumps({**FACTS,**{k:v for k,v in PROFILE.items() if k!='databaseFacts'}})
        locale.verify_owned(Db(),PROFILE)
        with self.assertRaisesRegex(ValueError,'OWNED_ICU_LOCALE_OR_VERSION_MISMATCH'):locale.verify_owned(Db(),{**PROFILE,'icuLocale':'und'})

    def fixture(self,root):
        t=datetime.now(timezone.utc);end=t+timedelta(hours=1);uid=str(uuid.uuid4())
        packet={'approvalId':uid,'target':a.TARGET,'codeSha256':'c'*64,'manifestSha256':'a'*64,'identityPath':'/fixture/same-identity','windowStart':t.isoformat(),'windowEnd':end.isoformat()}
        claim=a.claim_restore_replay(packet,'c'*64)
        def write(name,data):
            p=root/name;p.write_text(json.dumps(data));p.chmod(0o600);return str(p),hashlib.sha256(p.read_bytes()).hexdigest()
        marker=root/('approval-'+uid+'.restore-replay.used.json');claim_hash=hashlib.sha256(marker.read_bytes()).hexdigest()
        old={'validFrom':t.isoformat(),'validUntil':end.isoformat(),'target':a.TARGET,'approvalId':uid,'humanAuthorizationRecordSha256':a.AUTHORITY_SHA256,'codeHashes':{'restore-replay':'c'*64}}
        oldpath,oldhash=write('original-start.json',old)
        failure={'status':'FAIL_LOCAL_RESTORE','cleanup':'PASS','reason':'UNSUPPORTED_DATABASE_LOCALE_PROFILE','oneTimeRestoreClaim':claim,'directHumanAuthorization':{'mainStartReceiptSha256':oldhash}}
        failurepath,failurehash=write('failure.json',failure)
        supplement={**FACTS,'locale':'en-US','icuRules':None,'collationVersion':'153.121','actualCollationVersion':'153.121','sourceProject':a.TARGET,'database':'postgres','owner':'postgres','serverVersion':'17.6','observedAt':t.isoformat(),'captureApprovalId':uid,'captureManifestSha256':'a'*64,'evidenceKind':'readonly-database-locale-after-capture-same-approved-window','targetWritten':False,'userRowsRead':False}
        metapath,metahash=write('locale.json',supplement)
        repair='e'*40
        review={'status':'MAIN_REVIEWED_LOCALE_REPAIR_RETRY','attempt':1,'previousOwnedCloneAbsent':True,'noActualAttemptInFlight':True,'originalApprovalId':uid,'manifestSha256':'a'*64,'identityPathSha256':hashlib.sha256(packet['identityPath'].encode()).hexdigest(),'reviewedRepairCommit':repair,'originalClaimSha256':claim_hash,'priorFailureResultPath':failurepath,'priorFailureResultSha256':failurehash,'originalStartRecordPath':oldpath,'originalStartRecordSha256':oldhash,'localeSupplementSha256':metahash,'sameCapturedDatabaseLocaleUnchanged':True}
        start={'reviewedSourceCommit':repair,'retry':review}
        _,starthash=write('start.json',start)
        packet.update(codeSha256='d'*64,mainStartReceiptSha256=starthash,localeSupplementPath=metapath,localeSupplementSha256=metahash)
        return packet,{'verification':{'databaseFacts':FACTS,'databaseOwner':'postgres'}},t,start,write

    def test_explicit_retry_bound_to_original_capture_cleanup_identity_window(self):
        with tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='retry-contract-') as tmp:
            root=Path(tmp);os.chmod(root,0o700)
            with patch.object(a,'ROOT',root),patch.object(a,'START_FILE',root/'start.json'),patch.object(a,'CLAIM_ROOT',root):
                packet,manifest,t,start,write=self.fixture(root)
                self.assertEqual(retry.validate(a,packet,manifest,locale,t,datetime.fromisoformat),PROFILE)
                for key,value in [('identityPath','/fixture/different-key'),('windowEnd',(t+timedelta(hours=2)).isoformat()),('manifestSha256','b'*64),('approvalId',str(uuid.uuid4()))]:
                    with self.subTest(key=key),self.assertRaises(ValueError):retry.validate(a,{**packet,key:value},manifest,locale,t,datetime.fromisoformat)
                for key,value in [('noActualAttemptInFlight',False),('previousOwnedCloneAbsent',False),('sameCapturedDatabaseLocaleUnchanged',False),('attempt',2),('originalClaimSha256','b'*64)]:
                    changed=copy.deepcopy(start);changed['retry'][key]=value;_,digest=write('start.json',changed)
                    with self.subTest(key=key),self.assertRaises(ValueError):retry.validate(a,{**packet,'mainStartReceiptSha256':digest},manifest,locale,t,datetime.fromisoformat)
                failure_path=Path(start['retry']['priorFailureResultPath']);failure=json.loads(failure_path.read_text())
                for key,value in [('cleanup','FAIL'),('status','PASS_LOCAL_BUNDLE_RESTORE_ONLY'),('reason','different_failure')]:
                    _,failhash=write('failure.json',{**failure,key:value});changed=copy.deepcopy(start);changed['retry']['priorFailureResultSha256']=failhash;_,digest=write('start.json',changed)
                    with self.subTest(failure=key),self.assertRaisesRegex(ValueError,'RETRY_PRIOR_LOCALE_FAILURE_CLEANUP_REQUIRED'):retry.validate(a,{**packet,'mainStartReceiptSha256':digest},manifest,locale,t,datetime.fromisoformat)
                write('failure.json',failure)
                write('start.json',start)
                with self.assertRaisesRegex(ValueError,'RETRY_FRESH_LOCALE_SUPPLEMENT_REQUIRED'):retry.validate(a,packet,manifest,locale,t+timedelta(minutes=6),datetime.fromisoformat)
                original=(root/('approval-'+packet['approvalId']+'.restore-replay.used.json')).read_bytes()
                barrier=threading.Barrier(8)
                def contender(_):
                    barrier.wait()
                    try:return a.claim_restore_replay(packet,'d'*64,reviewed_retry=True)
                    except ValueError as e:return str(e)
                with ThreadPoolExecutor(max_workers=8) as pool:outcomes=list(pool.map(contender,range(8)))
                self.assertEqual(sum(isinstance(x,dict) for x in outcomes),1)
                self.assertEqual(outcomes.count('RESTORE_REPLAY_APPROVAL_ALREADY_CONSUMED'),7)
                with self.assertRaisesRegex(ValueError,'RESTORE_REPLAY_APPROVAL_ALREADY_CONSUMED'):a.claim_restore_replay(packet,'d'*64,reviewed_retry=True)
                self.assertEqual((root/('approval-'+packet['approvalId']+'.restore-replay.used.json')).read_bytes(),original)

    def test_retry_without_original_claim_rejected(self):
        with tempfile.TemporaryDirectory(dir=HERE.parents[1]/'artifacts/QAWEB/staging-replay',prefix='retry-no-original-') as tmp,patch.object(a,'CLAIM_ROOT',Path(tmp)):
            os.chmod(tmp,0o700)
            with self.assertRaisesRegex(ValueError,'DIRECT_AUTHORITY_RECORD_MISSING'):a.claim_restore_replay({'approvalId':str(uuid.uuid4()),'target':a.TARGET,'codeSha256':'c'*64,'manifestSha256':'a'*64},'c'*64,reviewed_retry=True)
            self.assertEqual(list(Path(tmp).iterdir()),[])


if __name__=='__main__':unittest.main(verbosity=2)
