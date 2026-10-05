import Foundation
import Observation
import SwiftUI

enum NativeLibrarySource:String,CaseIterable,Codable {
    case materials,orders,translations,results
    func label(_ chinese:Bool)->String {
        switch self {
        case .materials:return chinese ? "已确认资料":"Confirmed materials"
        case .orders:return chinese ? "已确认订单":"Confirmed orders"
        case .translations:return chinese ? "已存翻译":"Saved translations"
        case .results:return chinese ? "生成成果":"Generated results"
        }
    }
}
struct NativeLibraryMetadata:Decodable,Identifiable,Equatable {
    let source:NativeLibrarySource
    let id:String
    let revision:Int?
    let title:String
    let summary:String
    let createdAt:String?
    let tripId:String?
    var valid:Bool {
        NativeMemoryWire.uuid(id) && !title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && title.utf16.count<=120 && summary.utf16.count<=240
        && (source == .results ? revision.map{(1...1000).contains($0)}==true:source == .translations && revision==nil)
        && (tripId==nil || tripId.map(NativeMemoryWire.uuid)==true) && createdAt==nil
    }
}
struct NativeLibraryPage:Decodable {
    let version:Int
    let kind:String
    let source:NativeLibrarySource
    let status:String
    let reason:String?
    let items:[NativeLibraryMetadata]?
    let nextCursor:String?
    static func decode(_ bytes:Data,source:NativeLibrarySource,query:String?=nil)throws->Self {
        guard bytes.count<=100_000,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(raw.keys)==Set(["version","kind","source","status","reason","items","nextCursor"]) else{throw NativeDataError.invalidResponse}
        if let rows=raw["items"] as? [[String:Any]] {guard rows.allSatisfy({Set($0.keys)==Set(["source","id","revision","title","summary","createdAt","tripId"])}) else{throw NativeDataError.invalidResponse}}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.version==1,value.kind=="library_page",value.source==source else{throw NativeDataError.invalidResponse}
        if value.status=="unavailable" {
            guard ["DOMAIN_READER_MISSING","DOMAIN_UNAVAILABLE"].contains(value.reason ?? ""),value.items==nil,value.nextCursor==nil else{throw NativeDataError.invalidResponse}
        }else {
            guard [.results,.translations].contains(source),value.status=="available",value.reason==nil,let rows=value.items,rows.count<=20,rows.allSatisfy({$0.source==source && $0.valid}),Set(rows.map(\.id)).count==rows.count,
                  value.nextCursor==nil || NativeLibraryCursor.valid(value.nextCursor!,source:source,query:query) else{throw NativeDataError.invalidResponse}
        }
        return value
    }
}
enum NativeLibraryProjection {
    case result(NativeFiveResultRecord)
    case translation(NativeTranslationPhrase)
    case unavailable
    static func decode(_ bytes:Data,reference:NativeLibraryMetadata)throws->Self {
        guard bytes.count<=1_100_000,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any] else{throw NativeDataError.invalidResponse}
        if Set(raw.keys)==Set(["version","kind"]),raw["version"] as? Int==1,raw["kind"] as? String=="unavailable" {return .unavailable}
        guard Set(raw.keys)==Set(["version","kind","source","id","revision","projection"]),raw["version"] as? Int==1,raw["kind"] as? String=="library_item",raw["source"] as? String==reference.source.rawValue,raw["id"] as? String==reference.id,
              let projection=raw["projection"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        if reference.source == .results {
            guard raw["revision"] as? Int==reference.revision,let revision=reference.revision else{throw NativeDataError.invalidResponse}
            return try NativeFiveResultRecord.decode(JSONSerialization.data(withJSONObject:projection),artifactID:reference.id,revision:revision).map(Self.result) ?? .unavailable
        }
        guard reference.source == .translations,raw["revision"] is NSNull,projection["version"] as? Int==2 else{throw NativeDataError.invalidResponse}
        if projection["kind"] as? String=="unavailable" {guard Set(projection.keys)==Set(["version","kind"]) else{throw NativeDataError.invalidResponse};return .unavailable}
        guard Set(projection.keys)==Set(["version","kind","policyId","phrase"]),projection["kind"] as? String=="translation",let policy=projection["policyId"] as? String,NativeMemoryWire.uuid(policy),let row=projection["phrase"] as? [String:Any],Set(row.keys)==Set(["turnId","sourceLocale","targetLocale","original","state","translation","backTranslation"]) else{throw NativeDataError.invalidResponse}
        let phrase=try JSONDecoder().decode(NativeTranslationPhrase.self,from:JSONSerialization.data(withJSONObject:row))
        guard phrase.valid,phrase.state=="translated",phrase.turnId==reference.id else{throw NativeDataError.invalidResponse};return .translation(phrase)
    }
}
@MainActor @Observable final class NativeLibrarySourceStore {
    struct Key:Equatable {
        let scope:NativeDataScope;let source:NativeLibrarySource;let query:String;let cursor:String?
        static func ==(a:Self,b:Self)->Bool{a.scope==b.scope && a.source==b.source && a.query.utf8.elementsEqual(b.query.utf8) && a.cursor==b.cursor}
    }
    private(set) var page:NativeLibraryPage?
    private(set) var projection:NativeLibraryProjection?
    private(set) var loading=false
    private var generation=UUID()
    private var key:Key?
    private var deadline:TimeInterval=0
    private let uptime:()->TimeInterval
    init(uptime:@escaping()->TimeInterval={ProcessInfo.processInfo.systemUptime}){self.uptime=uptime}
    func clear(){generation=UUID();page=nil;projection=nil;key=nil;deadline=0;loading=false}
    func visible(_ requested:Key?)->NativeLibraryPage?{guard requested != nil,requested==key,uptime()<deadline else{return nil};return page}
    func visibleProjection(_ scope:NativeDataScope?)->NativeLibraryProjection?{guard scope != nil,scope==key?.scope,uptime()<deadline else{return nil};return projection}
    func load(key requested:Key,current:@escaping()->Key?,request:()async throws->Data)async {
        clear();guard requested==current(),requested.query.utf16.count<=120 else{return};key=requested;let own=generation,started=uptime();loading=true
        defer{if generation==own{loading=false}}
        do {
            let bytes=try await request();guard generation==own,current()==requested,!Task.isCancelled else{return}
            guard uptime()-started<30 else{throw NativeDataError.invalidResponse}
            page=try NativeLibraryPage.decode(bytes,source:requested.source,query:requested.query.isEmpty ? nil:requested.query);deadline=started+30
        }catch{if generation==own{page=nil;deadline=0}}
    }
    func open(_ reference:NativeLibraryMetadata,scope:NativeDataScope,current:@escaping()->NativeDataScope?,request:()async throws->Data)async {
        clear();guard reference.valid,current()==scope else{return};let requested=Key(scope:scope,source:reference.source,query:"",cursor:nil);key=requested
        let own=generation,started=uptime();loading=true;defer{if generation==own{loading=false}}
        do {
            let bytes=try await request();guard generation==own,current()==scope,!Task.isCancelled else{return}
            guard uptime()-started<30 else{throw NativeDataError.invalidResponse}
            projection=try NativeLibraryProjection.decode(bytes,reference:reference);deadline=started+30
        }catch{if generation==own{projection=nil;deadline=0}}
    }
}

enum NativeLibraryCursor {
    static func valid(_ cursor:String,source:NativeLibrarySource,query:String?)->Bool {
        guard [.results,.translations].contains(source),cursor.utf8.count<=4000,cursor.range(of:"^l1\\.[A-Za-z0-9_-]+$",options:.regularExpression) != nil else{return false}
        let encoded=String(cursor.dropFirst(3)),base=encoded.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
        guard let bytes=Data(base64Encoded:base+String(repeating:"=",count:(4-base.count%4)%4)),String(data:bytes,encoding:.utf8) != nil,
              let value=try? JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(value.keys)==Set(["source","query","domainCursor"]),value["source"] as? String==source.rawValue,
              (query==nil ? value["query"] is NSNull:(value["query"] as? String).map{$0.utf8.elementsEqual(query!.utf8)}==true),let domain=value["domainCursor"] as? String,domain.utf16.count<=1200 else{return false}
        return bytes.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")==encoded
    }
}
struct NativeLibrarySourcesView:View {
    let session:NativeSession
    let chinese:Bool
    let active:Bool
    let query:String
    @Environment(\.scenePhase) private var phase
    @State private var source=NativeLibrarySource.translations
    @State private var store=NativeLibrarySourceStore()
    @State private var cursor:String?
    @State private var opened:NativeLibraryMetadata?
    @State private var reservationsOpen=false
    @State private var savedPlacesOpen=false
    @State private var refresh=UUID()
    private var key:NativeLibrarySourceStore.Key?{guard active,phase == .active,let scope=session.dataScope else{return nil};return .init(scope:scope,source:source,query:query,cursor:cursor)}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            Button(t("已收藏地点引用", "Saved place references")){savedPlacesOpen=true}.disabled(key==nil).accessibilityIdentifier("library.saved.places")
            Picker(t("私有来源","Private source"),selection:$source){ForEach(NativeLibrarySource.allCases,id:\.self){value in Text(value.label(chinese)).tag(value)}}
                .accessibilityIdentifier("library.sources.choice")
            if source == .orders {
                Button(t("打开订单引用／报告外部改签或取消","Open reservation references / report external amendment or cancellation")){reservationsOpen=true}
                    .disabled(key==nil).accessibilityIdentifier("library.reservations.open")
                Text(t("订单引用在独立行程页面读取。此聚合来源服务仍未接入，不能把下方不可用状态当成没有订单。","Reservation references are read in a dedicated Trip view. This aggregate source reader is not connected; the unavailable state below does not mean there are no orders.")).font(.footnote)
            }
            Text(t("查询有来源窗口限制；本页没有匹配不代表全部历史没有结果，可继续下一页。打开会重新核对精确身份与权限。","Queries have source-window limits. No match on this page does not mean no match in all history; continue to the next page when available. Opening rechecks exact identity and authority.")).font(.footnote)
            TimelineView(.periodic(from:.now,by:1)){_ in
                if key==nil {Text(t("请登录后读取自己的资料。","Sign in to read your own materials."))}
                else if query.utf16.count>120 {Text(t("请缩短查询至120字符以内。","Shorten the query to120 characters."))}
                else if let page=store.visible(key) {
                    if page.status=="unavailable" {
                        Text(page.reason=="DOMAIN_READER_MISSING" ? t("此资料来源尚无可用读取服务，不能宣称资料为空。可选择已存翻译或生成成果。","This source has no available reader; it is not an empty collection. Choose saved translations or generated results."):t("此来源当前暂不可读，请核对权限并刷新。","This source is currently unreadable. Check permission and refresh."))
                            .accessibilityIdentifier(source == .translations ? "library.phrases.unavailable":"library.sources.unavailable")
                    }else {
                        let rows=page.items ?? []
                        if rows.isEmpty {Text(t("本页没有匹配的可读资料。","No readable match on this page."))}
                        ForEach(rows){row in
                            Button {guard store.visible(key) != nil else{return};opened=row;store.clear()} label:{
                                VStack(alignment:.leading,spacing:4){Text(row.title).font(.headline);Text(row.summary).lineLimit(2);Text(row.tripId.map{t("行程：","Trip: ")+$0} ?? t("未关联行程","Not linked to a Trip")).font(.caption)}
                            }.accessibilityIdentifier(row.source == .translations ? "library.phrase.open."+row.id:"library.result.open")
                        }
                        if let next=page.nextCursor {Button(t("继续下一页","Continue to next page")){store.clear();cursor=next}.accessibilityIdentifier(source == .translations ? "library.phrases.older":"library.sources.next")}
                    }
                }else if store.loading {ProgressView()}
                else {Text(t("读取失败或快照已过期，请刷新；未确认旧资料仍可使用。","Read failed or expired. Refresh; older material is not confirmed usable."))}
            }
            Button(t("刷新此来源首页","Refresh this source’s first page")){store.clear();cursor=nil;refresh=UUID()}.disabled(key==nil).accessibilityIdentifier(source == .translations ? "library.phrases.refresh":"library.sources.refresh")
        }
        .task(id:Load(key:key,refresh:refresh)){
            guard let key else{store.clear();return}
            if !key.query.isEmpty,key.cursor==nil {do{try await Task.sleep(for:.milliseconds(250))}catch{return}}
            await store.load(key:key,current:{self.key}){try await session.librarySourcesRequest(source:source,query:query,cursor:cursor)}
        }
        .onChange(of:source){_,_ in store.clear();opened=nil;cursor=nil}
        .onChange(of:Data(query.utf8)){_,_ in store.clear();opened=nil;cursor=nil}
        .onChange(of:session.dataScope){_,_ in store.clear();opened=nil;cursor=nil}
        .onDisappear{store.clear();opened=nil}
        .sheet(item:$opened,onDismiss:{cursor=nil;refresh=UUID()}){reference in NativeLibraryExactSourceView(reference:reference,session:session,chinese:chinese,active:active)}
        .sheet(isPresented:$savedPlacesOpen){NativeSavedPlaceActionsView(session:session,chinese:chinese,active:active)}
        .sheet(isPresented:$reservationsOpen){NativeReservationsView(session:session,chinese:chinese,active:active)}
    }
    private struct Load:Equatable{let key:NativeLibrarySourceStore.Key?;let refresh:UUID}
}
private struct NativeLibraryExactSourceView:View {
    let reference:NativeLibraryMetadata
    let session:NativeSession
    let chinese:Bool
    let active:Bool
    @Environment(\.scenePhase) private var phase
    @State private var store=NativeLibrarySourceStore()
    @State private var refresh=UUID()
    private var scope:NativeDataScope?{active && phase == .active ? session.dataScope:nil}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        NavigationStack {ScrollView {VStack(alignment:.leading,spacing:12){
            Button(t("刷新此精确资料","Refresh this exact material")){store.clear();refresh=UUID()}
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let value=store.visibleProjection(scope) {
                    switch value {
                    case .result(let result):
                        NativeFiveResultCard(record:result,chinese:chinese)
                        NavigationLink(t("打开完整成果／明确选择","Open complete result / explicit choice")){NativeFiveResultDetail(artifactID:result.artifactID,revision:result.revision,session:session,chinese:chinese,active:active)}
                    case .translation(let phrase):NativeTranslationCard(phrase:phrase,chinese:chinese)
                    case .unavailable:Text(t("此资料当前不可用。","This material is currently unavailable."))
                    }
                }else if store.loading {ProgressView()}
                else {Text(t("资料已变化、撤回、删除或权限未确认；没有替换为最新／其他资料。","Material changed, was withdrawn/deleted, or authority was not confirmed. No latest or other material is substituted."))}
            }
        }.padding()}}
        .task(id:Load(scope:scope,reference:reference,refresh:refresh)){
            guard let scope else{store.clear();return}
            await store.open(reference,scope:scope,current:{self.scope}){try await session.librarySourceItem(reference)}
        }
        .onChange(of:scope){_,_ in store.clear()}.onDisappear{store.clear()}
    }
    private struct Load:Equatable{let scope:NativeDataScope?;let reference:NativeLibraryMetadata;let refresh:UUID}
}

struct NativeLibraryPlace {
    let name:String?
    let canonicalPoiID:String?
    let askTripID:String?
    let available:Bool
    static func decode(_ bytes:Data,provider:NativePlaceProvider,providerID:String,tripID:String)throws->Self {
        guard bytes.count<=64_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","kind","status","reason","entity","capabilities"]),NativeFiveResultContent.integer(root["version"])==1,root["kind"] as? String=="library_place",
              let caps=root["capabilities"] as? [String:Any],Set(caps.keys)==Set(["ask","save","add","visual"]) else{throw NativeDataError.invalidResponse}
        for (key,reason) in [("save","DOMAIN_WRITER_MISSING"),("add","NO_ELIGIBLE_EVIDENCE"),("visual","NO_LICENSED_VISUAL")] {
            guard let value=caps[key] as? [String:Any],Set(value.keys)==Set(["status","reason"]),value["status"] as? String=="unavailable",value["reason"] as? String==reason else{throw NativeDataError.invalidResponse}
        }
        guard let ask=caps["ask"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        let unavailableAsk=Set(ask.keys)==Set(["status","reason"]) && ask["status"] as? String=="unavailable" && ask["reason"] as? String=="CANONICAL_OR_TRIP_AUTHORITY_MISSING"
        if root["status"] as? String=="unavailable" {
            guard root["reason"] as? String=="DOMAIN_UNAVAILABLE",root["entity"] is NSNull,unavailableAsk else{throw NativeDataError.invalidResponse}
            return .init(name:nil,canonicalPoiID:nil,askTripID:nil,available:false)
        }
        guard root["status"] as? String=="available",root["reason"] is NSNull,let entity=root["entity"] as? [String:Any],Set(entity.keys)==Set(["provider","providerPoiId","canonicalPoiId","name","address","location","observedAt"]),entity["provider"] as? String==provider.rawValue,entity["providerPoiId"] as? String==providerID,
              let name=entity["name"] as? String,!name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,name.utf16.count<=500 else{throw NativeDataError.invalidResponse}
        let canonical=entity["canonicalPoiId"] as? String
        guard entity["canonicalPoiId"] is NSNull || canonical.map(NativeMemoryWire.uuid)==true,
              entity["address"] is NSNull || (entity["address"] as? String).map{$0.utf16.count<=2000}==true,
              entity["observedAt"] is NSNull || (entity["observedAt"] as? String).flatMap(NativeKnowledgeRead.date) != nil else{throw NativeDataError.invalidResponse}
        if !(entity["location"] is NSNull) {
            guard let point=entity["location"] as? [String:Any],Set(point.keys)==Set(["lat","lng","coordinateSystem"]),let lat=point["lat"] as? Double,let lng=point["lng"] as? Double,lat.isFinite,lng.isFinite,(-90...90).contains(lat),(-180...180).contains(lng),["gcj02","wgs84","bd09"].contains(point["coordinateSystem"] as? String ?? "") else{throw NativeDataError.invalidResponse}
        }
        if unavailableAsk {return .init(name:name,canonicalPoiID:canonical,askTripID:nil,available:true)}
        guard Set(ask.keys)==Set(["status","reference","handoff"]),ask["status"] as? String=="available",let reference=ask["reference"] as? [String:Any],Set(reference.keys)==Set(["tripId","canonicalPoiId"]),reference["tripId"] as? String==tripID,NativeMemoryWire.uuid(tripID),let canonical,reference["canonicalPoiId"] as? String==canonical,
              let handoff=ask["handoff"] as? [String:Any],Set(handoff.keys)==Set(["kind","href","poiId","readiness"]),handoff["kind"] as? String=="ask_ready",handoff["poiId"] as? String==canonical,handoff["readiness"] as? String=="recheck_required",handoff["href"] as? String=="/visepanda/ask?tripId="+tripID+"&poiId="+canonical else{throw NativeDataError.invalidResponse}
        return .init(name:name,canonicalPoiID:canonical,askTripID:tripID,available:true)
    }
}
