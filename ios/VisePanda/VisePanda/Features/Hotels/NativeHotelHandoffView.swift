import SwiftUI

struct NativeHotelHandoffView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.openURL) private var openURL
    @State private var name = ""
    @State private var checkIn = Date()
    @State private var checkOut = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var adults = 2
    @State private var rooms = 1
    @State private var children = false
    @State private var prepared: NativeHotelHandoff?
    @State private var message: String?

    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private var search: NativeHotelSearch {
        .init(hotelOrCity: name, checkIn: NativeHotelHandoff.day(checkIn), checkOut: NativeHotelHandoff.day(checkOut),
              adults: adults, rooms: rooms, includesChildren: children)
    }

    var body: some View {
        Form {
            Section {
                Text(text("Continue your hotel search on an official travel site. No booking is made in VisePanda.", "前往官方旅行网站继续搜索酒店。VisePanda 不会代你预订。"))
                TextField(text("Hotel name or city", "酒店名称或城市"), text: $name)
                    .accessibilityIdentifier("hotel.query")
                Text(text("Enter only a public hotel name or city, without guest names, passport details, health information or booking references.", "仅填写公开的酒店名称或城市，不要输入旅客姓名、护照、健康信息或订单编号。"))
                    .font(.footnote).foregroundStyle(.secondary)
                DatePicker(text("Check-in", "入住"), selection: $checkIn, in: Date()..., displayedComponents: .date)
                DatePicker(text("Check-out", "退房"), selection: $checkOut, in: Date()..., displayedComponents: .date)
                Stepper(text("Adults: \(adults)", "成人：\(adults)"), value: $adults, in: 1...30)
                Stepper(text("Rooms: \(rooms)", "客房：\(rooms)"), value: $rooms, in: 1...30)
                Toggle(text("Travelling with children", "有儿童同行"), isOn: $children)
                    .accessibilityIdentifier("hotel.children")
            }
            Section {
                Text(text("These are ordinary official links without VisePanda affiliate tracking. VisePanda does not receive booking status or claim commission attribution.", "这些是未添加 VisePanda 联盟追踪的普通官方链接。VisePanda 不会接收预订状态，也不声称已获得佣金归因。"))
                ForEach(NativeHotelProvider.allCases) { provider in
                    Button(text("Continue on \(provider.title)", "前往 \(provider.title)")) { prepare(provider) }
                        .accessibilityIdentifier("hotel.prepare.\(provider.rawValue)")
                }
            }
            if let message { Section { Text(message).accessibilityIdentifier("hotel.status") } }
        }
        .navigationTitle(text("Hotel search", "酒店搜索"))
        .onChange(of: search) { _, _ in prepared = nil; message = nil }
        .sheet(item: $prepared) { receipt in
            NavigationStack {
                Form {
                    Section(text("Before you leave", "离开前确认")) {
                        Text(receipt.search.hotelOrCity)
                        Text("\(receipt.search.checkIn) – \(receipt.search.checkOut)")
                        Text(text("\(receipt.search.adults) adults · \(receipt.search.rooms) rooms", "\(receipt.search.adults) 位成人 · \(receipt.search.rooms) 间客房"))
                        Text(disclosure(receipt)).accessibilityIdentifier("hotel.disclosure")
                        Text(text("Prices, taxes, availability, cancellation rules and foreign-passport eligibility must be checked with the provider or hotel. Opening a link does not confirm a booking or change your Trip.", "价格、税费、库存、取消规则和外宾入住资格均需向平台或酒店核实。打开链接不代表预订成功，也不会修改行程。"))
                        Button(text("Open \(receipt.provider.title)", "打开 \(receipt.provider.title)")) { open(receipt) }
                            .accessibilityIdentifier("hotel.open")
                        Button(text("Back to edit", "返回修改")) { prepared = nil }
                            .accessibilityIdentifier("hotel.cancel")
                    }
                }
                .navigationTitle(receipt.provider.title)
            }
        }
    }

    private func disclosure(_ receipt: NativeHotelHandoff) -> String {
        if receipt.provider == .trip {
            return text("Trip.com opens its hotel search page. Hotel, dates, guests, rooms and filters are not sent; enter all conditions there.", "Trip.com 将打开酒店搜索首页。酒店、日期、人数、房间数和筛选条件均不会传递，请到站重新填写。")
        }
        let occupancy = receipt.search.includesChildren
            ? text("Guest and room counts are not sent when travelling with children. Enter all guests, child ages and rooms there.", "有儿童同行时不会传递任何人数和房间数。请到站填写全部旅客人数、儿童年龄和客房数。")
            : text("Adult and room counts are included.", "链接包含成人数和房间数。")
        return text("Your hotel/city text and dates are sent to Booking.com for search, not an exact hotel reservation. \(occupancy) Filters are not sent. Select the hotel again on the destination site. Check every field after opening; website and app handoffs may change them.", "酒店或城市文字及日期将发送给 Booking.com 用于搜索，不代表指定酒店已被选定。\(occupancy)筛选条件不会传递，请到站重新选择具体酒店。网站或 App 跳转可能改变条件，请到站逐项核对。")
    }

    private func prepare(_ provider: NativeHotelProvider) {
        do { prepared = try NativeHotelHandoff.prepare(search, provider: provider); message = nil }
        catch { message = text("Enter a hotel or city, today or later dates, a stay of 1–90 nights, and at least one adult per room.", "请填写酒店或城市、今天或之后的入住日期、1–90 晚住宿，以及不少于客房数的成人数。") }
    }

    private func open(_ receipt: NativeHotelHandoff) {
        var current = receipt
        do {
            let url = try current.validateForOpen()
            prepared = nil
            openURL(url) { accepted in
                current.recordOpen(acceptedBySystem: accepted)
                message = accepted
                    ? text("Link handed to your device. Check the destination and all search fields. Booking status is unknown; your Trip is unchanged.", "链接已交给设备打开。请核对目标网站和所有搜索条件。预订状态未知，行程未改变。")
                    : text("Your device could not open the link. Try again or use the other official site.", "设备无法打开链接。请重试，或选择另一官方入口。")
            }
        } catch {
            prepared = nil
            message = text("This search link expired. Review your dates and prepare a new link.", "搜索链接已过期，请核对日期后重新生成。")
        }
    }
}
