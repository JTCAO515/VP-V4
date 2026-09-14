import ui,json,sys,pathlib,subprocess,time
name,expected=sys.argv[1:];s=ui.snapshot()
button=next((x for x in s if x['type']=='Button' and x['AXLabel'] in ['Before using AI','使用AI之前']),None)
if button and any(x['AXUniqueId']=='native-ask.notice' for x in s):ui.axe(['tap','--label',button['AXLabel'],'--element-type','Button'])
s=ui.snapshot();answers=[x for x in s if (x['AXUniqueId'] or '').startswith('knowledge.answer.')];assert answers and answers[0]['AXUniqueId']=='knowledge.answer.'+expected,(name,answers[:1])
first=answers[0];shift=min(300,max(0,first['frame']['y']-145))
if shift:ui.axe(['swipe','--start-x','200','--start-y','495','--end-x','200','--end-y',str(495-shift),'--duration','1','--post-delay','1.5'])
s=ui.snapshot();pathlib.Path(name+'.json').write_text(json.dumps(s,ensure_ascii=False,indent=2));subprocess.run(['xcrun','simctl','io',ui.UDID,'screenshot',name+'.png'],env=ui.ENV,check=True,capture_output=True)
print(json.dumps({'name':name,'answers':[x['AXUniqueId'] for x in s if (x['AXUniqueId'] or '').startswith('knowledge.answer.')][:3],'visible':[{'id':x['AXUniqueId'],'label':x['AXLabel']} for x in s if 116<x['frame']['y']<528 and (x['AXUniqueId'] or '').startswith('knowledge.')]},ensure_ascii=False))
