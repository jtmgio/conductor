// Conductor quick capture — the ⌘Space front door ("todo").
//
// One window: what to do, which company, today or backlog. Everything is reachable
// from the keyboard (⌘1…9 company, ⌘T today, Enter add, Esc cancel) because the whole
// point is that your hands never leave the keys.
//
// Replaces the AppleScript dialog, which couldn't offer a picker. Talks to /api/capture
// directly — GET for the company list, POST to file the task.
//
// Config (same as mac/conductor-capture.sh):
//   URL:   $CONDUCTOR_URL, else ~/.conductor/url, else http://localhost:5402
//   token: ~/.conductor/capture-token (written by build-capture-app.sh from the repo .env)

import AppKit
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

// MARK: - View

struct CaptureView: View {
    let cfg: Config

    @State private var text = ""
    @State private var companies: [Company] = []
    @State private var selected: String?
    @State private var scheduleToday = false
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
            TextField("What do you need to do?", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 23))
                .focused($fieldFocused)
                .onSubmit(submit)
                .onAppear { fieldFocused = true }

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
                        ) { selected = c.id }
                            .help(c.name)
                            .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                    }
                    Spacer(minLength: 0)
                }
            }

            HStack(spacing: 10) {
                chip(label: scheduleToday ? "Today" : "Backlog",
                     hint: nil,
                     tint: scheduleToday ? .orange : .secondary,
                     active: scheduleToday) { scheduleToday.toggle() }
                    .keyboardShortcut("t", modifiers: .command)

                Text(selectedName)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                if phase == .saving {
                    ProgressView().controlSize(.small)
                } else {
                    Button("Add", action: submit)
                        .keyboardShortcut(.return, modifiers: [])
                        .buttonStyle(.borderedProminent)
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            Text("⌘1–9 company · ⌘T today · ↩ add · esc cancel")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)

            // Esc cancels
            Button("") { NSApp.terminate(nil) }
                .keyboardShortcut(.cancelAction)
                .frame(width: 0, height: 0)
                .opacity(0)
        }
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
                let r = try await API.capture(cfg, text: t, roleId: selected, today: scheduleToday)
                phase = .done("Added to \(r.company)" + (r.key.map { " · \($0)" } ?? ""))
                try? await Task.sleep(for: .seconds(1.4))
            } catch {
                phase = .failed(error.localizedDescription)
                try? await Task.sleep(for: .seconds(3))
            }
            NSApp.terminate(nil)
        }
    }
}

// MARK: - App

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!

    func applicationDidFinishLaunching(_ n: Notification) {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 210),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.contentView = NSHostingView(rootView: CaptureView(cfg: Config.load()))
        window.center()
        window.level = .floating
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)  // transient capture window — no Dock icon
app.run()
