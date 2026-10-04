import Foundation
enum NativeDataError:Error{case invalidResponse,staleSessionResponse}
enum NativeMemoryWire{static func uuid(_ s:String)->Bool{UUID(uuidString:s)?.uuidString.lowercased()==s}}
enum NativeQualifiedDelegationRPC{static func digest(_ s:String)->Bool{s.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil}}
struct NativeKnowledgeSelection{static let cities=["shanghai","beijing","guangzhou","chongqing"]}
enum NativeKnowledgeRead{static func date(_ s:String)->Date?{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:s) ?? ISO8601DateFormatter().date(from:s)}}
