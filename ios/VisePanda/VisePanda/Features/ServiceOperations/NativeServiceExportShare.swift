import SwiftUI
import UIKit

/// Reached only by the user's explicit Share button, after the app's current lease check.
struct NativeServiceExportShare: UIViewControllerRepresentable {
    let file: NativeServiceExportFile
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let items: [Any] = file.current(actor: file.owner) ? [file.url] : []
        return UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
