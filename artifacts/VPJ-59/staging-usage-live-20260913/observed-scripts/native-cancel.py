import ui,json,time,pathlib
r=pathlib.Path('.');a=json.loads((r/'admitted.json').read_text());ident='native-ask.cancel.'+a['turnId']
for i in range(10):
 tree=ui.snapshot();(r/('cancel-view-'+str(i)+'.json')).write_text(json.dumps(tree,indent=2))
 candidates=[x for x in tree if x.get('AXUniqueId')==ident and x.get('type')=='Button' and x.get('enabled')]
 if candidates:
  f=candidates[0]['frame'];x=f['x']+f['width']/2;y=f['y']+f['height']/2
  if 120<y<580:
   p=r/'native-cancel-intent.json';assert not p.exists();p.write_text(json.dumps({'at':time.time(),'turnId':a['turnId'],'x':x,'y':y,'action':'cancel same Turn'}));ui.axe(['tap','-x',str(x),'-y',str(y)]);print('Cancel clicked once on original Turn');break
 ui.axe(['swipe','--start-x','220','--start-y','520','--end-x','220','--end-y','170','--duration','1']);time.sleep(0.6)
else:raise RuntimeError('Original Turn cancel control not visible')
