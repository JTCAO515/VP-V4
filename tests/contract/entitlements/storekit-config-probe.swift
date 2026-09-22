// Standalone macOS probe. Loads local test configuration only; never purchases.
import Foundation
import StoreKit
import StoreKitTest

@main
struct StoreKitConfigurationProbe {
    static func main() async {
        do { try await run() }
        catch {
            FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
            exit(1)
        }
    }

    static func run() async throws {
        guard CommandLine.arguments.count > 1 else {
            throw NSError(domain: "VPJ33Probe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Pass one or more .storekit paths"])
        }
        for path in CommandLine.arguments.dropFirst() {
            let session = try SKTestSession(contentsOf: URL(fileURLWithPath: path))
            guard session.storefront == "USA" else {
                throw NSError(domain: "VPJ33Probe", code: 2, userInfo: [NSLocalizedDescriptionKey: "StoreKitTest failed to apply configuration or read storefront"])
            }
            let input = try JSONDecoder().decode(Configuration.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
            guard let expected = input.nonRenewingSubscriptions.first,
                  input.nonRenewingSubscriptions.count == 1 else {
                throw NSError(domain: "VPJ33Probe", code: 3)
            }
            let products = try await Product.products(for: [expected.productID])
            guard products.count == 1, let product = products.first,
                  product.type == .nonRenewable,
                  product.price == Decimal(string: expected.displayPrice),
                  !product.displayPrice.isEmpty else {
                throw NSError(domain: "VPJ33Probe", code: 4, userInfo: [NSLocalizedDescriptionKey: "StoreKit product type/price did not match the local configuration"])
            }
            print("PASS: StoreKit product \(product.id), type=nonRenewable, displayPrice=\(product.displayPrice)")
            print("PASS: StoreKitTest loaded \(URL(fileURLWithPath: path).lastPathComponent), storefront=\(session.storefront)")
        }
    }
}

private struct Configuration: Decodable {
    let nonRenewingSubscriptions: [TestProduct]
    struct TestProduct: Decodable {
        let productID: String
        let displayPrice: String
    }
}
