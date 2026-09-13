import ui,json,pathlib,time
p=pathlib.Path('.');a=json.loads((p/'admitted.json').read_text());ident='native-ask.cancel.'+a['turnId'];question=json.loads((p/'native-en-root-intent.json').read_text())['text']
for i in range(12):
 r=ui.snapshot();(p/('cancel-view-'+str(i)+'.json')).write_text(json.dumps(r,indent=2))
 notice=next((x for x in r if x.get('AXUniqueId')=='native-ask.notice'),None)
 disclosures=[x for x in r if x.get('type')=='Button' and x.get('AXLabel')=='Before using AI']
 if notice and disclosures and 120<disclosures[0]['frame']['y']<500:
  f=disclosures[0]['frame'];ui.axe(['tap','-x',str(f['x']+f['width']-8),'-y',str(f['y']+f['height']/2)]);continue
 candidates=[x for x in r if x.get('AXUniqueId')==ident and x.get('type')=='Button' and x.get('enabled')]
 if candidates:
  f=candidates[0]['frame'];x=f['x']+f['width']/2;y=f['y']+f['height']/2
  if 170<y<550:
   assert any(t.get('AXLabel')==question for t in r),'Original question must be in native tree';target=p/'native-cancel-intent.json';assert not target.exists();target.write_text(json.dumps({'at':time.time(),'turnId':a['turnId'],'questionMatched':True,'x':x,'y':y}));ui.axe(['tap','-x',str(x),'-y',str(y)]);print('Native cancel clicked on original Turn');break
  if y<=170:ui.axe(['swipe','--start-x','240','--start-y','250','--end-x','240','--end-y','430','--duration','1']);continue
 ui.axe(['swipe','--start-x','240','--start-y','500','--end-x','240','--end-y','350','--duration','1']);time.sleep(.5)
else:raise RuntimeError('Original cancel control not visible')
