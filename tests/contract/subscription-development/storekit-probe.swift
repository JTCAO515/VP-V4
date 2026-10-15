// Standalone local configuration probe. No purchase, account login or simulator.
import Foundation
import StoreKit
import StoreKitTest

@main
struct MonthlyConfigurationProbe {
    enum ProbeError: Error {
        case invalidArguments
        case configurationMismatch
        case productMismatch
    }

    static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw ProbeError.invalidArguments }
            let path = URL(fileURLWithPath: CommandLine.arguments[1])
            let session = try SKTestSession(contentsOf: path)
            guard session.storefront == "USA" else { throw ProbeError.configurationMismatch }
            let products = try await Product.products(for: ["dev.visepanda.subscription.monthly"])
            guard products.count == 1, let product = products.first,
                  product.id == "dev.visepanda.subscription.monthly",
                  product.type == .autoRenewable,
                  product.price == Decimal(string: "0.99"),
                  !product.displayPrice.isEmpty,
                  let subscription = product.subscription,
                  subscription.subscriptionGroupID == "dev.visepanda.subscription",
                  subscription.subscriptionPeriod.unit == .month,
                  subscription.subscriptionPeriod.value == 1 else { throw ProbeError.productMismatch }
            print("PASS: local StoreKitTest configuration loaded; storefront=\(session.storefront)")
            print("PASS: product=\(product.id), type=autoRenewable, unit=month, value=1, group=\(subscription.subscriptionGroupID), synthetic price=\(product.price)")
            print("UNRUN: Sandbox transactions, renewal, refund, restoration, ledger, target UI, human acceptance")
        } catch {
            FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
            exit(1)
        }
    }
}
