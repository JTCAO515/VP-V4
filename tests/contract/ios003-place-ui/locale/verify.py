from pathlib import Path
import re,subprocess,tempfile,json
root=Path(__file__).resolve().parents[4]
relative='ios/VisePanda/VisePanda/Features/Frontend/Journeys/NativeFrontendJourneysView.swift'
source=(root/relative).read_text()
baseline=subprocess.check_output(['git','show','a76799149cec460e742ab101a8b8190512b24464:'+relative],cwd=root,text=True)
pair=re.compile(r'copy\(("(?:\\.|[^"\\])*"),\s*("(?:\\.|[^"\\])*")\)')
pairs=pair.findall(source)
assert len(pairs)>=70,len(pairs)
# Reverse only presentation adapters; the complete original actions, IDs, bindings,
# payload expressions and static plan content must remain the same.
normalized=pair.sub(lambda m:m[1],source)
normalized=normalized.replace('    @Environment(\\.locale) private var locale\n','').replace('    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }\n','')
for name in ['screenStateTitle','modeTitle']:
 start=normalized.index('    private func '+name+'(')
 opening=normalized.index('{',start);depth=1;end=opening+1
 while depth:
  if normalized[end]=='{':depth+=1
  elif normalized[end]=='}':depth-=1
  end+=1
 normalized=normalized[:start]+normalized[end:]
normalized=normalized.replace('screenStateTitle(value)','value.title').replace('modeTitle($0)','$0').replace('modeTitle(mode)','mode')
assert ''.join(normalized.split())==''.join(baseline.split()),'Unexpected non-presentation change'
for value in ['Text(journey.title)','Text(journey.subtitle)','Text(title)','Text(dayTitle)',
              'marker("城市漫步", icon: "building.2")','marker("江景", icon: "water.waves")','marker("休息", icon: "cup.and.saucer")',
              '一段城市漫步，一次江景停留；留时间确认入口与休息。','慢一点看街区，给休息留出空间。']:
 assert value in source and value in baseline,value
# Exercise the accepted actual PR714 helper against every literal pair used by this leaf.
helper=(root/'ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/NativeFrontendLibraryActions.swift').read_text()
helper=helper[helper.index('struct NativeLibraryMemoryCopy {'):]
def string(raw):return json.loads(raw.replace('\\(','\\\\('))
values=[(string(zh),string(en)) for zh,en in pairs]
assert all(not re.search(r'[\u3400-\u9fff]',en) for zh,en in values)
probe='import Foundation\n'+helper+'\n@main struct LocaleProbe { static func main() {\n'
for zh,en in values:
 for locale,wanted in [('zh-Hans',zh),('zh-Hant',zh),('en-US',en),('ar',en),('ru',en),('und',en)]:
  probe+='precondition(NativeLibraryMemoryCopy(locale:Locale(identifier:'+json.dumps(locale)+'))('+json.dumps(zh,ensure_ascii=False)+','+json.dumps(en,ensure_ascii=False)+') == '+json.dumps(wanted,ensure_ascii=False)+')\n'
probe+='print("PASS: '+str(len(values))+' fixed UI pairs × 6 locales; all original actions/IDs/payloads unchanged")\n} }\n'
with tempfile.TemporaryDirectory(prefix='ios003-journeys-locale-') as temp:
 path=Path(temp);(path/'Probe.swift').write_text(probe)
 subprocess.run(['xcrun','swiftc','-parse-as-library',str(path/'Probe.swift'),'-o',str(path/'probe')],check=True)
 subprocess.run([str(path/'probe')],check=True)
