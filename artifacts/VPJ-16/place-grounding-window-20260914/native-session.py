import ui,json,sys,subprocess,time
mode=sys.argv[1]
def profile():
 s=ui.snapshot();button=next(x for x in s if x['type']=='RadioButton' and x['AXLabel'] in ['Profile','我的']);ui.axe(['tap','--label',button['AXLabel'],'--element-type','RadioButton'])
def status():return next(x['AXLabel'] for x in ui.snapshot() if x['AXUniqueId']=='native.session.status')
if mode=='login':
 locale=sys.argv[2];assert locale in ['en','zh'];profile();assert status() in ['Signed out','尚未登录']
 for op in ['terminate','launch']:subprocess.run(['xcrun','simctl',op,ui.UDID,'space.go2china.VisePanda'],env=ui.ENV,check=True,capture_output=True)
 profile();s=ui.snapshot();lang=next(x['AXLabel'] for x in s if x['type']=='Button' and x['AXLabel'] in ['Language','语言'])
 if (lang=='Language')!=(locale=='en'):
  ui.axe(['tap','--label',lang,'--element-type','Button']);ui.axe(['tap','--label','English' if locale=='en' else '中文','--element-type','Button'])
 users=json.load(open('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json'))['users'];u=next(x for x in users if x['locale']==locale)
 for field in ['email','password']:
  ui.axe(['tap','--id','native.login.'+field]);ui.axe(['type','--stdin'],u[field])
 ui.axe(['tap','--id','native.login.submit'])
 for i in range(30):
  observed=status()
  if observed in ['Session active','会话有效']:break
  time.sleep(.5)
 assert observed in ['Session active','会话有效'],observed
 ui.axe(['tap','--label','Ask' if locale=='en' else '问熊猫','--element-type','RadioButton']);print(json.dumps({'mode':mode,'locale':locale,'status':'PASS'}))
elif mode=='logout':
 profile();s=ui.snapshot();button=next(x['AXLabel'] for x in s if x['type']=='Button' and x['AXLabel'] in ['Sign out','退出登录']);ui.axe(['tap','--label',button,'--element-type','Button'])
 for i in range(30):
  observed=status()
  if observed in ['Signed out','尚未登录']:break
  time.sleep(.5)
 assert observed in ['Signed out','尚未登录'],observed;print(json.dumps({'mode':mode,'status':'PASS','signedOut':True}))
