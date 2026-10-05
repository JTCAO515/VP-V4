import UIKit
import UniformTypeIdentifiers

/// Actual NSExtension principal class. The extension completes delivery; the user opens the app explicitly.
@MainActor final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let done = UIButton(type: .system)
    private var started = false
    private var finished = false
    private var saved = false
    private var resultResolved = false
    private var delivery: ShareIntakeDelivery?
    private var progress: Progress?
    private var timeout: Task<Void, Never>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let title = UILabel()
        title.text = localized("share.title")
        title.font = .preferredFont(forTextStyle: .title2)
        title.adjustsFontForContentSizeCategory = true
        title.accessibilityTraits = .header
        message.numberOfLines = 0
        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        message.text = localized("share.receiving")
        done.setTitle(localized("share.done"), for: .normal)
        done.isEnabled = false
        done.addTarget(self, action: #selector(complete), for: .touchUpInside)
        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle(localized("share.cancel"), for: .normal)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, message, done, cancelButton])
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        guard let items = extensionContext?.inputItems, items.count == 1,
              let item = items[0] as? NSExtensionItem, let attachments = item.attachments, attachments.count == 1,
              let provider = attachments.first, provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) else {
            show(.failure(.format)); return
        }
        do {
            let transfer = ShareIntakeDelivery(inbox: try ShareIntakeInbox.configured())
            delivery = transfer
            progress = transfer.start(provider: provider) { [weak self] result in
                Task { @MainActor [weak self] in
                    if case .failure(.integrity) = result { self?.show(result, replace: true) }
                    else { self?.show(result) }
                }
            }
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                guard let self, !finished else { return }
                progress?.cancel()
                do { try delivery?.cancel() } catch { show(.failure(.integrity)); return }
                show(.failure(.unavailable))
            }
        } catch {
            show(.failure(.unavailable))
        }
    }

    private func show(_ result: Result<ShareIntakeInbox.Receipt, ShareIntakeError>, replace: Bool = false) {
        guard !finished, !resultResolved || replace else { return }
        resultResolved = true
        timeout?.cancel(); timeout = nil
        done.isEnabled = true
        switch result {
        case .success:
            saved = true
            message.text = localized("share.saved")
        case .failure(let error):
            saved = false
            let key: String
            switch error {
            case .size: key = "share.size"
            case .pages: key = "share.pages"
            case .format, .encrypted: key = "share.format"
            case .full: key = "share.full"
            case .integrity: key = "share.cleanup"
            default: key = "share.unavailable"
            }
            message.text = localized(key)
        }
        UIAccessibility.post(notification: .announcement, argument: message.text)
    }

    @objc private func complete() {
        guard !finished else { return }
        if saved {
            finished = true
            timeout?.cancel()
            extensionContext?.completeRequest(returningItems: nil)
        } else {
            cancel()
        }
    }

    @objc private func cancel() {
        guard !finished else { return }
        progress?.cancel()
        timeout?.cancel(); timeout = nil
        do { try delivery?.cancel() } catch {
            // Retain the error UI: never report successful deletion after a failed cleanup.
            show(.failure(.integrity), replace: true); return
        }
        finished = true
        extensionContext?.cancelRequest(withError: NSError(domain: "VisePanda.ShareIntake", code: 1))
    }

    private func localized(_ key: String) -> String { NSLocalizedString(key, bundle: .main, comment: "") }
}
