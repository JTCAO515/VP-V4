import Foundation
struct NativePendingAsk:Codable { let valid:Bool;let mobileEpoch:Int }
struct NativeAssistantNavigation {}
struct NativeExploreAskHandoff {}
enum NativeAskMode:String { case assistant,grounded,taskContext,currentInput,unavailable }
final class NativeMemoryPreferencesStore { func clear() {} }
final class NativeOfflineTripStore { func eraseAll()throws {} }
final class NativeDeviceMaterials { func eraseAll()throws{};func firstAccess(preservingInbox:Bool)throws{} }
enum InboxError:Error { case invalidInput }
struct NativeDeviceMaterialDeleteRequest { struct Namespace { let owner:String;let endpoint:String;let epoch:Int };let namespace:Namespace;static func decode(_ data:Data)throws->Self{throw InboxError.invalidInput} }
enum NativeTravelPace { case relaxed,balanced,packed }
struct NativeTextTurn { struct Result { let completedAt:String?;let projection:String };let valid:Bool;let status:String;let result:Result?;let input:String }
