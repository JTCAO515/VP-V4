import SwiftUI

struct NativeSelectedEvidencePicker:View {
    let session:NativeSession;let chinese:Bool;let selected:[NativeSelectedSources.Evidence]
    let choose:(NativeDataScope,NativeSelectedSources.Evidence)->Void
    @Environment(\.dismiss) private var dismiss
    @State private var city="shanghai"
    @State private var scene="rail"
    @State private var store=NativeKnowledgeStore()
    private var selection:NativeKnowledgeSelection{.init(city:city,scene:scene,locale:chinese ? "zh":"en")}
    private var key:Key{.init(scope:session.dataScope,selection:selection)}
    var body:some View{
        NavigationStack{List{
            Text(chinese ? "明确选择当前已发布第一方事实及版本，不复制资料正文或赋予外发权限。":"Select an exact current published first-party fact/version; no source body or external-send authority is copied.")
            Picker(chinese ? "证据城市":"Evidence city",selection:$city){ForEach(["shanghai","beijing","guangzhou","chongqing"],id:\.self){Text($0).tag($0)}}
            Picker(chinese ? "场景":"Scene",selection:$scene){ForEach(["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"],id:\.self){Text($0).tag($0)}}
            if store.isCurrent(scope:session.dataScope,selection:selection){
                ForEach(store.rows){row in Button{
                    guard let scope=session.dataScope,store.isCurrent(scope:scope,selection:selection),selected.count<3,
                          !selected.contains(where:{$0.factId==row.factId}) else{return}
                    choose(scope,.init(factId:row.factId,assertionId:row.assertionId,assertionRevision:row.assertionRevision,city:city,scene:scene));dismiss()
                }label:{VStack(alignment:.leading){Text(row.text);Text("v\(row.assertionRevision) · \(row.publishedAt)").font(.caption)}}
                    .disabled(selected.count>=3 || selected.contains(where:{$0.factId==row.factId}))}
                if store.rows.isEmpty{Text(chinese ? "此范围没有当前可读取事实。":"No current readable facts for this scope.")}
            }else{Text(chinese ? "事实资格尚未确认，不能选择旧列表。":"Fact qualification is not confirmed; an old list cannot be selected.")}
        }.navigationTitle(chinese ? "选择证据版本":"Choose evidence version").toolbar{Button(chinese ? "取消":"Cancel"){dismiss()}}}
        .task(id:key){let requested=key;await store.load(scope:requested.scope,selection:requested.selection){try await session.knowledgeRequest(selection:requested.selection)};if key != requested{store.clear()}}
        .onChange(of:key){_,_ in store.clear()}.onDisappear{store.clear()}
    }
    private struct Key:Equatable{let scope:NativeDataScope?;let selection:NativeKnowledgeSelection}
}
