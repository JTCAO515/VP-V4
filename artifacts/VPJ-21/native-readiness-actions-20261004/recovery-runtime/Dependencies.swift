import Foundation
enum NativeDataError:Error{case invalidResponse,staleSessionResponse}
enum NativeMemoryWire{static func uuid(_ s:String)->Bool{UUID(uuidString:s)?.uuidString.lowercased()==s}}
enum NativeQualifiedDelegationRPC{static func digest(_ s:String)->Bool{s.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil}}
struct NativeKnowledgeSelection{static let cities=["shanghai","beijing","guangzhou","chongqing"]}
enum NativeKnowledgeRead{static func date(_ s:String)->Date?{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:s) ?? ISO8601DateFormatter().date(from:s)}}
struct NativeDataScope:Equatable {let endpoint:String;let subject:String;let mobileEpoch:Int;let generation:Int}
struct NativeFiveResultReference{let artifactID:String;let revision:Int;static func decode(_ data:Data,field:String,expectedID:String)throws->Self?{nil}}
struct NativeFiveResultRecord{struct Source{let taskId:String?};let source:Source;static func decode(_ data:Data,artifactID:String,revision:Int)throws->Self?{nil}}
