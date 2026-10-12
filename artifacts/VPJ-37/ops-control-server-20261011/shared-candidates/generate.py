from pathlib import Path
import hashlib,json,difflib,subprocess
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
BASE=subprocess.check_output(['git','merge-base','HEAD','origin/main'],cwd=ROOT,text=True).strip()
PRIVATE_HEAD=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
entries=[]
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def candidate(path, edits, holder):
 before=(ROOT/path).read_text();after=before
 for edit in edits:
  old,new=edit[:2];expected=edit[2] if len(edit)>2 else 1
  if after.count(old)!=expected:raise ValueError(f'{path}: expected {expected} matching hunk, found {after.count(old)}: {old[:70]}')
  after=after.replace(old,new,expected)
 target=OUT/'sources'/path;target.parent.mkdir(parents=True,exist_ok=True)
 Path(str(target)+'.before.txt').write_text(before);Path(str(target)+'.after.txt').write_text(after)
 patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path,n=0))
 Path(str(target)+'.patch').write_text(patch)
 entries.append({'path':path,'beforeSha256':sha(before),'afterSha256':sha(after),'currentHolder':holder,'applied':False})
W1='01a0af16-3f91-7e52-b444-c6f57f364c04 explicit HOLD; Main precise release required'
NATIVE='UNKNOWN current shared native owner; Main must obtain exact release, no last-author inference'
candidate('lib/server/contracts/errors/index.ts',[( '  "UNAUTHENTICATED", "FORBIDDEN", "RATE_LIMITED",','  "UNAUTHENTICATED", "FORBIDDEN", "RATE_LIMITED",\n  "OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE",'),('  PROVIDER_UNAVAILABLE: spec(', '  OPS_CONTROL_DISABLED: spec(503, "unavailable", false, false, "ops_control_disabled"),\n  OPS_SCOPE_UNAVAILABLE: spec(503, "unavailable", false, false, "ops_scope_unavailable"),\n  PROVIDER_UNAVAILABLE: spec(')],W1)
for path,marker in [('lib/server/identity/user-data-adapter.ts','function mapRpcFailure(message: string): FailureCode {'),('lib/server/turn/native-http.ts','function mapError(message: string): FailureCode {'),('lib/server/turn/native-assistant-http.ts','function mapError(message: string): FailureCode {')]:
 candidate(path,[(marker,marker+'\n  if (message === "OPS_CONTROL_DISABLED" || message === "OPS_SCOPE_UNAVAILABLE") return message;')],W1)
candidate('lib/server/turn/native-planning-intake-http.ts', [('function mappedError(message:string):[string,number]{','function mappedError(message:string):[string,number]{\n if(message==="OPS_CONTROL_DISABLED"||message==="OPS_SCOPE_UNAVAILABLE")return [message,503];')],W1)
candidate('lib/server/turn/native-planning-http.ts',[('    if(result.error){const message=String(result.error.message);','    if(result.error){const message=String(result.error.message);\n      if(message==="OPS_CONTROL_DISABLED"||message==="OPS_SCOPE_UNAVAILABLE")return fail(message,503);')],W1)
candidate('lib/server/trip/scoped-edit/service.ts',[('export function mappedError(message: string): string {','export function mappedError(message: string): string {\n  if(message === "OPS_CONTROL_DISABLED" || message === "OPS_SCOPE_UNAVAILABLE") return message;')],W1)
candidate('components/chat/ChatThreadWorkspace.tsx',[
 ('  const [state, setState] = useState<LoadState>("loading");','  const [state, setState] = useState<LoadState>("loading");\n  const [opsRefusal, setOpsRefusal] = useState<"OPS_CONTROL_DISABLED" | "OPS_SCOPE_UNAVAILABLE" | null>(null);'),
 ('      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }\n      pendingStarts.current.delete(selected.thread.id);','      if (!response.ok) {\n        const body: unknown = await response.json().catch(() => null);\n        if (body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 2 && "error" in body && "status" in body) {\n          const error = body.error;\n          if (error && typeof error === "object" && !Array.isArray(error) && Object.keys(error).length === 1 && "code" in error\n            && (error.code === "OPS_CONTROL_DISABLED" || error.code === "OPS_SCOPE_UNAVAILABLE")) {\n            setOpsRefusal(error.code); return;\n          }\n        }\n        setState(response.status === 401 ? "unauthenticated" : "unavailable"); return;\n      }\n      setOpsRefusal(null);\n      pendingStarts.current.delete(selected.thread.id);'),
 ('      {state === "ready" ? <>','      {opsRefusal ? <aside role="status"><p>{locale === "zh" ? "此能力暂时停用，或当前城市范围无法核实。已有行程保留，请查看原行程并手工调整。" : "This capability is paused or the current city scope cannot be qualified. Existing Trips are retained; open the original Trip to edit manually."}</p><Link href={selected?.thread.tripId ? `/visepanda/trips/${encodeURIComponent(selected.thread.tripId)}` : "/visepanda/trips"}>{locale === "zh" ? "查看已有行程" : "Open existing Trips"}</Link></aside> : null}\n      {state === "ready" ? <>')],W1)
candidate('ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift',[
 ('    var canSend: Bool {\n        !pendingAcknowledged','    var canSend: Bool {\n        !["OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE"].contains(notice ?? "") && !pendingAcknowledged')],NATIVE)
candidate('ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift',[
 ('                    if store.notice != nil { Text("ask.local.retry_hint").font(.footnote).accessibilityIdentifier("native-ask.error") }','''                    if let code = store.notice, ["OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE"].contains(code) {
                        Text(settings.selectedLocale == .zh ? "此能力暂时停用，或当前城市范围无法核实。已有行程与成果保留；请查看原行程并按原确认流程手工调整。" : "This capability is paused or the current city scope cannot be qualified. Existing Trips and results are retained; edit through the original confirmation flow.")
                            .font(.footnote).accessibilityIdentifier("native-ask.ops-refusal")
                        NavigationLink(destination: NativeJourneysView()) {
                            Text(settings.selectedLocale == .zh ? "查看已有行程与成果" : "Open existing Trips and results")
                        }.accessibilityIdentifier("native-ask.ops-alternative")
                    } else if store.notice != nil { Text("ask.local.retry_hint").font(.footnote).accessibilityIdentifier("native-ask.error") }''')],NATIVE)
candidate('ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditSheet.swift',[
 ('        case "queued": t(', '''        case "OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE": t("VP editing is paused or the current scope cannot be qualified. Close this sheet to read the same retained Trip and edit manually through its original confirmation flow. Sent operations are not retried automatically.", "VP 编辑暂时停用，或当前范围无法核实。关闭此页可查看同一已有行程，按原确认流程手工调整；不会自动重发已发送操作。")
        case "queued": t(''')],NATIVE)
(OUT/'pins.json').write_text(json.dumps({'base':BASE,'privateHead':PRIVATE_HEAD,'applied':False,'files':entries},indent=2)+'\n')
print(f'{len(entries)} full before/patch/after candidates written; no shared apply')
