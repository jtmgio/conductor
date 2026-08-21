import AppKit
import WebKit

/// Where Conductor lives, in the order we'll try.
///
/// `~/.conductor/url` wins when present — the same file Todo.app already reads,
/// so a laptop pointed at the tower configures both apps at once. Otherwise try
/// localhost first (instant when you're on the tower) and fall back to the
/// Tailscale hostname.
enum Endpoint {
    static let fallbacks = [
        "http://localhost:5402",
        "http://joshuas-mac-pro.tail842fd4.ts.net:5402",
    ]

    static func candidates() -> [URL] {
        var raw: [String] = []
        let configured = (try? String(contentsOfFile: NSString(string: "~/.conductor/url").expandingTildeInPath, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let configured, !configured.isEmpty { raw.append(configured) }
        raw.append(contentsOf: fallbacks.filter { $0 != configured })
        return raw.compactMap { URL(string: $0) }
    }
}

final class WebWindowController: NSWindowController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var errorView: ErrorView!
    private var candidateIndex = 0
    private var retryCount = 0
    private var retryWork: DispatchWorkItem?

    private var currentURL: URL { Endpoint.candidates()[min(candidateIndex, Endpoint.candidates().count - 1)] }

    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Conductor"
        // Traffic lights sit over the page's own sidebar. The web side pads for
        // them behind [data-native], injected below, so a browser is unaffected.
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 900, height: 560)
        // Matches --background in the web app, so there is no white flash before
        // the first paint and no light seam while resizing.
        window.backgroundColor = NSColor(red: 0.114, green: 0.114, blue: 0.106, alpha: 1)
        window.setFrameAutosaveName("ConductorMainWindow")

        super.init(window: window)
        buildWebView()
        load()
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private func buildWebView() {
        let config = WKWebViewConfiguration()
        // The NextAuth session cookie has to survive relaunch, or the app asks
        // for the password every time it opens.
        config.websiteDataStore = .default()

        // Tell the page it is running natively. A single additive CSS rule keyed
        // on [data-native] can then pad the sidebar clear of the traffic lights
        // and declare the drag region — with no React changes, and no effect in
        // a browser, where the attribute is simply absent.
        let flag = WKUserScript(
            source: "document.documentElement.dataset.native = 'macos';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(flag)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false

        errorView = ErrorView { [weak self] in self?.retryNow() }
        errorView.translatesAutoresizingMaskIntoConstraints = false
        errorView.isHidden = true

        let container = NSView()
        container.addSubview(webView)
        container.addSubview(errorView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            errorView.topAnchor.constraint(equalTo: container.topAnchor),
            errorView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            errorView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])
        window?.contentView = container
    }

    private func load() {
        errorView.isHidden = true
        webView.load(URLRequest(url: currentURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12))
    }

    @objc func reload() {
        retryCount = 0
        candidateIndex = 0
        load()
    }

    /// Menu-bar navigation. Uses the page's own client-side router rather than a
    /// fresh page load, so the app shell (and anything it is holding — a running
    /// stand-up timer, an open alert) survives the jump. Falls back to a real
    /// navigation if the router hook isn't there.
    func go(to path: String) {
        let js = """
        (function () {
          try {
            var a = document.createElement('a');
            a.href = '\(path)';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (e) { location.pathname = '\(path)'; }
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    @objc func goToday()     { go(to: "/") }
    @objc func goBoard()     { go(to: "/board") }
    @objc func goTracker()   { go(to: "/tracker") }
    @objc func goFormatter() { go(to: "/formatter") }
    @objc func goMeetings()  { go(to: "/meetings") }
    @objc func goSettings()  { go(to: "/settings") }

    private func retryNow() {
        retryWork?.cancel()
        retryCount = 0
        load()
    }

    /// The dominant failure isn't the tower being down, it's the laptop's wifi
    /// blinking — so retry on a backoff without being asked, and let the button
    /// short-circuit the wait when you've actually fixed something.
    private func scheduleRetry() {
        retryWork?.cancel()
        let delays: [Double] = [2, 5, 15, 30]
        let delay = delays[min(retryCount, delays.count - 1)]
        retryCount += 1

        // Try the next endpoint before giving up on this one entirely.
        if retryCount == 2 && candidateIndex + 1 < Endpoint.candidates().count {
            candidateIndex += 1
            retryCount = 0
        }

        let work = DispatchWorkItem { [weak self] in self?.load() }
        retryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        errorView.setRetrying(in: delay)
    }

    private func fail(_ title: String, _ detail: String) {
        errorView.present(title: title, detail: detail, url: currentURL.absoluteString)
        errorView.isHidden = false
        scheduleRetry()
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        retryCount = 0
        retryWork?.cancel()
        errorView.isHidden = true
        refreshTitle()
    }

    /// The page never updates document.title, so derive something useful from
    /// the route. Shows up in the Dock, the Window menu and the ⌘` switcher.
    private func refreshTitle() {
        webView.evaluateJavaScript("location.pathname") { [weak self] value, _ in
            guard let path = value as? String else { return }
            let names = ["/": "Today", "/board": "Board", "/tracker": "Tracker",
                         "/formatter": "Formatter", "/meetings": "Meetings",
                         "/settings": "Settings", "/inbox": "Inbox", "/plan": "Plan tomorrow"]
            let leaf = names[path] ?? path.split(separator: "/").first.map(String.init)?.capitalized
            self?.window?.title = leaf.map { "Conductor — \($0)" } ?? "Conductor"
        }
    }

    /// Never connected — wrong host, tower down, Tailscale asleep.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let ns = error as NSError
        if ns.code == NSURLErrorCancelled { return }
        fail("Can’t reach Conductor", ns.localizedDescription)
    }

    /// Connected, then dropped mid-load.
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let ns = error as NSError
        if ns.code == NSURLErrorCancelled { return }
        fail("Lost the connection", ns.localizedDescription)
    }

    /// The trap: an HTTP 500 is a *successful* navigation as far as the two
    /// didFail callbacks are concerned. Without this, a broken tower renders a
    /// Next.js error page and the shell looks fine.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let http = navigationResponse.response as? HTTPURLResponse else {
            decisionHandler(.allow); return
        }
        if http.statusCode >= 500 {
            decisionHandler(.cancel)
            fail("Conductor is running, but erroring",
                 "The server answered with HTTP \(http.statusCode). Check the container logs.")
            return
        }
        decisionHandler(.allow)
    }
}
