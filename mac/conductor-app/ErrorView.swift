import AppKit

/// The failure screen, in AppKit rather than injected HTML.
///
/// Deliberate: when the webview is what's broken, you cannot ask it to explain
/// itself. A WKWebView that fails to load renders a blank white rectangle —
/// no message, no reload button, no ⌘R — so without this the app simply looks
/// dead. It also shows the URL it tried, because the answer is almost always
/// "wrong host" or "Docker isn't up" and you want to see which.
final class ErrorView: NSView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(wrappingLabelWithString: "")
    private let urlLabel = NSTextField(labelWithString: "")
    private let statusLabel = NSTextField(labelWithString: "")
    private let retryButton = NSButton(title: "Try again", target: nil, action: nil)
    private let onRetry: () -> Void

    init(onRetry: @escaping () -> Void) {
        self.onRetry = onRetry
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor(red: 0.114, green: 0.114, blue: 0.106, alpha: 1).cgColor

        let dim = NSColor(red: 0.63, green: 0.62, blue: 0.58, alpha: 1)
        let faint = NSColor(red: 0.45, green: 0.44, blue: 0.41, alpha: 1)

        titleLabel.font = .systemFont(ofSize: 21, weight: .semibold)
        titleLabel.textColor = NSColor(red: 0.90, green: 0.89, blue: 0.88, alpha: 1)
        titleLabel.alignment = .center

        detailLabel.font = .systemFont(ofSize: 13.5)
        detailLabel.textColor = dim
        detailLabel.alignment = .center
        detailLabel.preferredMaxLayoutWidth = 380

        urlLabel.font = .monospacedSystemFont(ofSize: 11.5, weight: .regular)
        urlLabel.textColor = faint
        urlLabel.alignment = .center

        statusLabel.font = .systemFont(ofSize: 11.5)
        statusLabel.textColor = faint
        statusLabel.alignment = .center

        retryButton.bezelStyle = .rounded
        retryButton.target = self
        retryButton.action = #selector(retryTapped)
        retryButton.keyEquivalent = "\r"

        let stack = NSStackView(views: [titleLabel, detailLabel, urlLabel, retryButton, statusLabel])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        stack.setCustomSpacing(18, after: urlLabel)
        stack.setCustomSpacing(14, after: retryButton)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func present(title: String, detail: String, url: String) {
        titleLabel.stringValue = title
        detailLabel.stringValue = detail
        urlLabel.stringValue = url
    }

    func setRetrying(in seconds: Double) {
        let s = Int(seconds.rounded())
        statusLabel.stringValue = "Retrying in \(s) second\(s == 1 ? "" : "s")…"
    }

    @objc private func retryTapped() {
        statusLabel.stringValue = "Retrying…"
        onRetry()
    }
}
