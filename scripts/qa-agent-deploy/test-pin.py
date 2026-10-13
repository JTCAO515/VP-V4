"""Scoped, offline negative checks. No platform, deployment or configuration write."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).parent))
spec=importlib.util.spec_from_file_location('qa_pin',Path(__file__).with_name('pin.py'))
pin=importlib.util.module_from_spec(spec);spec.loader.exec_module(pin)
SHA='7d0c5128857e859720452d8a9f864fd8b20c8388'
NEW='codex/qaw005-independent-target-20261013'

class BindingChecks(unittest.TestCase):
    def setUp(self):
        self.project={'id':pin.PROJECT,'accountId':pin.TEAM,'link':{'org':'JTCAO515','repo':'VP-V4','productionBranch':'main'},'env':[{'key':'UNRELATED_PRIVATE_KEY','value':'SYNTHETIC_SECRET_SENTINEL','type':'sensitive','target':['production']} ]}
        self.domain={'name':pin.DOMAIN,'projectId':pin.PROJECT,'gitBranch':pin.BRANCH}
    def validate(self,ref=pin.APPROVED_REF):
        return pin.validate_binding(self.project,self.domain,NEW,pin.BRANCH,ref)
    def test_missing_invalid_or_other_target_denied(self):
        for ref in [None, '', 'otherprojectref000000', pin.APPROVED_REF+'/', pin.APPROVED_REF.upper()]:
            with self.assertRaises(ValueError):self.validate(ref)
    def test_project_domain_drift_and_production_branch_denied(self):
        self.domain['gitBranch']=NEW
        with self.assertRaises(ValueError):self.validate()
        self.domain['gitBranch']=pin.BRANCH;self.project['accountId']='other-team'
        with self.assertRaises(ValueError):self.validate()
        with self.assertRaises(ValueError):pin.make_package(SHA,'main',pin.BRANCH,pin.APPROVED_REF,True,None,[],{})
        with self.assertRaises(ValueError):pin.make_package(SHA,'codex/qaw005-runtime-followup-20261013',pin.BRANCH,pin.APPROVED_REF,True,None,[],{})
    def test_existing_opaque_ref_or_enable_flag_denied(self):
        self.project['env'].append({'key':pin.REF_KEY,'type':'encrypted','value':'opaque','target':['preview'],'gitBranch':NEW})
        with self.assertRaises(ValueError):self.validate()
        self.project['env'][-1]={'key':'VISEPANDA_QA_AGENT','target':['preview'],'gitBranch':NEW}
        with self.assertRaises(ValueError):self.validate()
    def test_candidate_keeps_old_domain_and_no_secret_values(self):
        names=self.validate();p=pin.make_package(SHA,NEW,pin.BRANCH,pin.APPROVED_REF,True,None,names,{})
        self.assertFalse(p['remoteExactMatch']);self.assertEqual(p['currentDomain']['gitBranch'],pin.BRANCH)
        self.assertEqual(p['domainPatchCandidate']['gitBranch'],NEW)
        self.assertFalse(p['domainChangeAllowedByThisTool']);self.assertEqual(p['resourceMutations'],0)
        self.assertNotIn('SYNTHETIC_SECRET_SENTINEL',json.dumps(p))
        self.assertNotIn('target',p['previewRequest'])
    def test_reviewed_request_rejects_unpushed_or_changed_remote(self):
        for remote in [None,'0'*40]:
            with self.assertRaises(ValueError):pin.make_package(SHA,NEW,pin.BRANCH,pin.APPROVED_REF,False,remote,[],{})
    def test_matching_plain_ref_metadata_only(self):
        self.project['env'].append({'key':pin.REF_KEY,'type':'plain','value':pin.APPROVED_REF,'target':['preview'],'gitBranch':NEW})
        names=self.validate();self.assertEqual(names[0]['key'],pin.REF_KEY);self.assertNotIn('value',names[0])
        p=pin.make_package(SHA,NEW,pin.BRANCH,pin.APPROVED_REF,False,SHA,names,{})
        self.assertTrue(p['remoteExactMatch']);self.assertFalse(p['domainChangeAllowedByThisTool'])

if __name__=='__main__':unittest.main()
