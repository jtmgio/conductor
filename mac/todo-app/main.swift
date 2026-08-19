// Conductor quick capture — the ⌘Space front door ("todo").
//
// One window, two modes. Task: what to do, which company, today or backlog. Message
// (⌘M): a rough draft in, the same draft in your voice out and on the clipboard.
// Everything is reachable from the keyboard (⌘1…9 company, ⌘T today, ⌘P platform,
// Enter go, Esc cancel) because the whole point is that your hands never leave the keys.
//
// Replaces the AppleScript dialog, which couldn't offer a picker. Talks to /api/capture
// (GET for the company list, POST to file a task) and /api/format (message mode).
//
// Config (same as mac/conductor-capture.sh):
//   URL:   $CONDUCTOR_URL, else ~/.conductor/url, else http://localhost:5402
//   token: ~/.conductor/capture-token (written by build-capture-app.sh from the repo .env)

import AppKit
import Carbon.HIToolbox
import SwiftUI

// MARK: - Config

struct Config {
    let baseURL: String
    let token: String

    static func load() -> Config {
        let home = FileManager.default.homeDirectoryForCurrentUser

        var url = ProcessInfo.processInfo.environment["CONDUCTOR_URL"] ?? ""
        if url.isEmpty, let f = try? String(contentsOf: home.appending(path: ".conductor/url"), encoding: .utf8) {
            url = f.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if url.isEmpty { url = "http://localhost:5402" }

        var token = ""
        if let f = try? String(contentsOf: home.appending(path: ".conductor/capture-token"), encoding: .utf8) {
            token = f.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return Config(baseURL: url, token: token)
    }
}

// MARK: - API

struct Company: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
    let taskPrefix: String?
    /// Where this company's messages usually go — preselects the platform in message mode.
    let platform: String?
}

struct OptionsResponse: Decodable {
    let companies: [Company]
    let currentRoleId: String?
}

struct CaptureResponse: Decodable {
    let ok: Bool
    let title: String
    let company: String
    let key: String?
}

struct FormatResponse: Decodable {
    let ok: Bool
    let formatted: String
    let company: String
    let platform: String
}

enum API {
    static func options(_ cfg: Config) async throws -> OptionsResponse {
        var req = URLRequest(url: URL(string: "\(cfg.baseURL)/api/capture")!)
        req.setValue("Bearer \(cfg.token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 10
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp)
        return try JSONDecoder().decode(OptionsResponse.self, from: data)
    }

    static func capture(_ cfg: Config, text: String, roleId: String?, today: Bool) async throws -> CaptureResponse {
        var req = URLRequest(url: URL(string: "\(cfg.baseURL)/api/capture")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(cfg.token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120  // a cold MLX refine can take ~30s
        var body: [String: Any] = ["text": text, "today": today]
        if let roleId { body["role"] = roleId }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp)
        return try JSONDecoder().decode(CaptureResponse.self, from: data)
    }

    static func format(_ cfg: Config, text: String, roleId: String?, platform: String) async throws -> FormatResponse {
        var req = URLRequest(url: URL(string: "\(cfg.baseURL)/api/format")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(cfg.token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 180  // a long message through a cold MLX can take a while
        var body: [String: Any] = ["text": text, "platform": platform]
        if let roleId { body["role"] = roleId }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        try check(resp)
        return try JSONDecoder().decode(FormatResponse.self, from: data)
    }

    private static func check(_ resp: URLResponse) throws {
        guard let http = resp as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200: return
        case 401: throw Err.message("Unauthorized — check ~/.conductor/capture-token")
        default: throw Err.message("Conductor returned HTTP \(http.statusCode)")
        }
    }

    enum Err: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }
}

// MARK: - Helpers

extension Color {
    /// Role colors arrive from the DB as "#RRGGBB".
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(
            .sRGB,
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}

enum Phase: Equatable {
    case editing
    case saving
    case done(String)
    case failed(String)
}

enum Mode: Equatable {
    case task
    case message
}

/// The platforms /api/format understands, in ⌘P cycle order.
let platforms = ["slack", "teams", "email", "sms"]

// MARK: - View

struct CaptureView: View {
    let cfg: Config
    /// What "done here" means depends on how we were launched: quit (one-shot) or
    /// just hide the window (daemon waiting on the hotkey).
    let dismiss: () -> Void

    @State private var text = ""
    @State private var companies: [Company] = []
    @State private var selected: String?
    @State private var scheduleToday = false
    @State private var mode: Mode = .task
    @State private var platform = "slack"
    @State private var phase: Phase = .editing
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            switch phase {
            case .done(let msg):
                result(icon: "checkmark.circle.fill", tint: .green, text: msg)
            case .failed(let msg):
                result(icon: "exclamationmark.triangle.fill", tint: .orange, text: msg)
            default:
                editor
            }
        }
        .padding(18)
        .frame(width: 640, alignment: .leading)
        .task { await loadCompanies() }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 13) {
            modeRow

            if mode == .message {
                // Longer text, so a smaller face and room to grow. Return still submits —
                // the Format button's key equivalent wins over the field's newline.
                TextField("Rough draft…", text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 17))
                    .lineLimit(2 ... 10)
                    .focused($fieldFocused)
                    .onAppear { fieldFocused = true }
            } else {
                TextField("What do you need to do?", text: $text)
                    .textFieldStyle(.plain)
                    .font(.system(size: 26))
                    .focused($fieldFocused)
                    .onSubmit(submit)
                    .onAppear { fieldFocused = true }
            }

            Divider().opacity(0.5)

            if companies.isEmpty {
                Text("Loading companies…")
                    .font(.system(size: 14))
                    .foregroundStyle(.tertiary)
                    .frame(height: 24)
            } else {
                // Prefix + its ⌘number. Nine of these have to fit on one row, so the
                // number is a bare digit here and the ⌘ is explained in the footer.
                HStack(spacing: 5) {
                    ForEach(Array(companies.prefix(9).enumerated()), id: \.element.id) { i, c in
                        chip(
                            label: c.taskPrefix ?? String(c.name.prefix(2)).uppercased(),
                            hint: "\(i + 1)",
                            tint: Color(hex: c.color),
                            active: selected == c.id
                        ) { selected = c.id; platform = c.platform ?? "slack" }
                            .help(c.name)
                            .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                    }
                    Spacer(minLength: 0)
                }
            }

            HStack(spacing: 10) {
                if mode == .message {
                    // ⌘1–9 belong to the companies, so the platform cycles on ⌘P. Only the
                    // active one carries the hint — four chips plus a company row is enough.
                    ForEach(platforms, id: \.self) { p in
                        chip(label: p == "sms" ? "SMS" : p.capitalized,
                             hint: p == platform ? "⌘P" : nil,
                             tint: .blue,
                             active: p == platform) { platform = p }
                    }
                } else {
                    chip(label: scheduleToday ? "Today" : "Backlog",
                         hint: nil,
                         tint: scheduleToday ? .orange : .secondary,
                         active: scheduleToday) { scheduleToday.toggle() }
                        .keyboardShortcut("t", modifiers: .command)
                }

                Text(selectedName)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                if phase == .saving {
                    ProgressView().controlSize(.small)
                } else {
                    Button(mode == .message ? "Format" : "Add", action: submit)
                        .keyboardShortcut(.return, modifiers: [])
                        .buttonStyle(.borderedProminent)
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            Text(mode == .message
                 ? "⌘1–9 company · ⌘P platform · ↩ format + copy · esc cancel"
                 : "⌘1–9 company · ⌘T today · ↩ add · esc cancel")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)

            // ⌘P cycles the platform; only meaningful in message mode.
            Button("") { if mode == .message { cyclePlatform() } }
                .keyboardShortcut("p", modifiers: .command)
                .frame(width: 0, height: 0)
                .opacity(0)

            // Esc cancels
            Button("") { dismiss() }
                .keyboardShortcut(.cancelAction)
                .frame(width: 0, height: 0)
                .opacity(0)
        }
    }

    /// Task | Message, plus the invisible ⌘M that flips between them.
    private var modeRow: some View {
        HStack(spacing: 6) {
            chip(label: "Task", hint: nil, tint: .orange, active: mode == .task) { setMode(.task) }
            chip(label: "Message", hint: "⌘M", tint: .blue, active: mode == .message) { setMode(.message) }
            Spacer(minLength: 0)
        }
        .overlay(
            Button("") { setMode(mode == .task ? .message : .task) }
                .keyboardShortcut("m", modifiers: .command)
                .frame(width: 0, height: 0)
                .opacity(0)
        )
    }

    private func cyclePlatform() {
        let i = platforms.firstIndex(of: platform) ?? 0
        platform = platforms[(i + 1) % platforms.count]
    }

    /// Switching into message mode pulls whatever you just copied into the field and selects
    /// it — the flow this exists for is copy a draft, hotkey, ⌘M, Enter. Typing replaces it.
    private func setMode(_ m: Mode) {
        guard mode != m else { return }
        mode = m
        if m == .message {
            platform = defaultPlatform
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               let clip = NSPasteboard.general.string(forType: .string),
               !clip.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                text = clip
                DispatchQueue.main.async {
                    NSApp.sendAction(#selector(NSText.selectAll(_:)), to: nil, from: nil)
                }
            }
        }
    }

    private var defaultPlatform: String {
        companies.first { $0.id == selected }?.platform ?? "slack"
    }

    private func result(icon: String, tint: Color, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 23)).foregroundStyle(tint)
            Text(text).font(.system(size: 17, weight: .medium))
            Spacer()
        }
        .frame(height: 40)
    }

    private var selectedName: String {
        companies.first { $0.id == selected }?.name ?? ""
    }

    private func chip(label: String, hint: String?, tint: Color, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(label).font(.system(size: 14, weight: .semibold))
                if let hint {
                    Text(hint).font(.system(size: 11, weight: .medium)).opacity(0.5)
                }
            }
            .fixedSize()  // never let the row compress a chip into an ellipsis
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(active ? tint.opacity(0.25) : Color.secondary.opacity(0.10), in: Capsule())
            .overlay(Capsule().strokeBorder(active ? tint : .clear, lineWidth: 1))
            .foregroundStyle(active ? tint : Color.secondary)
        }
        .buttonStyle(.plain)
    }

    private func loadCompanies() async {
        do {
            let opts = try await API.options(cfg)
            companies = opts.companies
            selected = opts.currentRoleId ?? opts.companies.first?.id  // preselect the current block's company
            platform = defaultPlatform
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func submit() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, phase != .saving else { return }
        phase = .saving
        Task {
            do {
                if mode == .message {
                    let r = try await API.format(cfg, text: t, roleId: selected, platform: platform)
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(r.formatted, forType: .string)
                    // On the clipboard is the whole point — flash it and get out of the way.
                    phase = .done("Copied · \(r.company) · \(r.platform)")
                    try? await Task.sleep(for: .seconds(1.1))
                    dismiss()
                    return
                }
                let r = try await API.capture(cfg, text: t, roleId: selected, today: scheduleToday)
                phase = .done("Added to \(r.company)" + (r.key.map { " · \($0)" } ?? ""))
                try? await Task.sleep(for: .seconds(1.4))
            } catch {
                phase = .failed(error.localizedDescription)
                try? await Task.sleep(for: .seconds(3))
            }
            dismiss()
        }
    }
}

// MARK: - App

class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var hotKeyRef: EventHotKeyRef?

    /// --daemon: stay resident and open the window on ⌃⌥Space (launchd keeps it alive).
    /// Without it, this is the one-shot Spotlight launch: window now, quit when done.
    private let isDaemon = CommandLine.arguments.contains("--daemon")

    func applicationDidFinishLaunching(_ n: Notification) {
        installEditMenu()
        if isDaemon {
            registerHotKey()
        } else {
            showWindow()
        }
    }

    func showWindow() {
        if let existing = window {
            existing.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 218),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        w.titlebarAppearsTransparent = true
        w.titleVisibility = .hidden
        w.isMovableByWindowBackground = true
        w.isReleasedWhenClosed = false
        // A controller, not a bare hosting view, so the window grows to fit its content —
        // message mode's read-back is much taller than the one-line capture field.
        w.contentViewController = NSHostingController(
            rootView: CaptureView(cfg: Config.load(), dismiss: { [weak self] in self?.dismiss() })
        )
        // No setContentSize — the controller sizes the window to its content, and message
        // mode's field and read-back are both taller than a capture line.
        w.center()
        w.level = .floating
        w.makeKeyAndOrderFront(nil)
        window = w
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Spotlight (or the Dock, or `open -a`) launching an app that is already running sends a
    /// reopen — not a fresh launch. Without this, the resident hotkey daemon just activated
    /// itself with no window, and ⌘Space → "todo" appeared to do nothing.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showWindow() }
        return true
    }

    private func dismiss() {
        guard isDaemon else { NSApp.terminate(nil); return }
        // Drop the window so the next ⌃⌥Space gets a clean field, not last capture's text.
        window?.orderOut(nil)
        window = nil
    }

    /// ⌘V and friends are delivered by the main menu's key equivalents, not by the text
    /// field itself — an app with no menu bar silently swallows them, which is why pasting
    /// into the capture field did nothing. An accessory app never *shows* this menu; it
    /// just needs it to exist for the shortcuts to route.
    private func installEditMenu() {
        let mainMenu = NSMenu()

        // Conventional empty app menu — the first item is never treated as a real menu.
        let appItem = NSMenuItem()
        appItem.submenu = NSMenu()
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(NSMenuItem.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        mainMenu.addItem(editItem)

        NSApp.mainMenu = mainMenu
    }

    /// ⌃⌥Space, via Carbon — the one global-hotkey API that needs no Accessibility grant.
    private func registerHotKey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, _, userData in
                guard let userData else { return noErr }
                let me = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
                DispatchQueue.main.async { me.showWindow() }
                return noErr
            },
            1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil
        )

        let id = EventHotKeyID(signature: OSType(0x434E4454), id: 1)  // 'CNDT'
        RegisterEventHotKey(
            UInt32(kVK_Space),
            UInt32(controlKey | optionKey),
            id,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
    }

    // One-shot mode quits with its window; the daemon outlives every window it opens.
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { !isDaemon }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)  // transient capture window — no Dock icon
app.run()
