import SwiftUI

/// Conductor — native macOS UI.
///
/// This is the interface only. No database, no API, no network, no webview:
/// every screen is SwiftUI drawing sample data, so the layout, motion and
/// interaction can be judged before anything is wired to the real system.
@main
struct ConductorUIApp: App {
    var body: some Scene {
        WindowGroup {
            Shell()
                .frame(minWidth: 940, minHeight: 620)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)          // traffic lights inset over the sidebar
        .defaultSize(width: 1320, height: 880)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Go") {
                // The shortcuts the app binds, made discoverable. Menus are the
                // only place on macOS where a shortcut documents itself.
                Button("Today")     { NotificationCenter.default.post(name: .goTo, object: Screen.today) }
                    .keyboardShortcut("1", modifiers: .command)
                Button("Board")     { NotificationCenter.default.post(name: .goTo, object: Screen.board) }
                    .keyboardShortcut("2", modifiers: .command)
                Button("Tracker")   { NotificationCenter.default.post(name: .goTo, object: Screen.tracker) }
                    .keyboardShortcut("3", modifiers: .command)
                Button("Formatter") { NotificationCenter.default.post(name: .goTo, object: Screen.formatter) }
                    .keyboardShortcut("4", modifiers: .command)
                Button("Meetings")  { NotificationCenter.default.post(name: .goTo, object: Screen.meetings) }
                    .keyboardShortcut("5", modifiers: .command)
                Divider()
                Button("Settings")  { NotificationCenter.default.post(name: .goTo, object: Screen.settings) }
                    .keyboardShortcut(",", modifiers: .command)
            }
            CommandGroup(after: .sidebar) {
                // ⌃⌘S is the macOS convention (Mail, Notes). ⌘[ is Back.
                Button("Hide Sidebar") { NotificationCenter.default.post(name: .toggleSidebar, object: nil) }
                    .keyboardShortcut("s", modifiers: [.command, .control])
            }
        }
    }
}

extension Notification.Name {
    static let goTo = Notification.Name("conductor.goTo")
    static let toggleSidebar = Notification.Name("conductor.toggleSidebar")
}

struct Shell: View {
    @State private var screen: Screen = .today
    @State private var collapsed = false
    @StateObject private var queue = AlertQueue()

    var body: some View {
        HStack(spacing: 0) {
            Sidebar(screen: $screen, collapsed: $collapsed)

            ZStack(alignment: .topTrailing) {
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .id(screen)
                    .transition(.opacity)

                TimerPill(queue: queue).padding(.top, 14).padding(.trailing, 18)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(T.ground)
            .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 46) }
        }
        .overlay(AlertOverlay(queue: queue))
        .overlay(alignment: .bottom) { demoTray }
        .animation(T.ease, value: screen)
        .animation(T.ease, value: collapsed)
        .onReceive(NotificationCenter.default.publisher(for: .goTo)) { note in
            if let s = note.object as? Screen { screen = s }
        }
        .onReceive(NotificationCenter.default.publisher(for: .toggleSidebar)) { _ in
            collapsed.toggle()
        }
    }

    @ViewBuilder private var content: some View {
        switch screen {
        case .today:     TodayView()
        case .board:     BoardView()
        case .tracker:   TrackerView()
        case .formatter: FormatterView()
        case .meetings:  MeetingsView()
        case .settings:  SettingsView()
        }
    }

    /// Prototype-only. Nothing schedules these, so there has to be a way to
    /// fire them by hand.
    private var demoTray: some View {
        HStack(spacing: 6) {
            Text("Fire:").font(.system(size: 11)).foregroundStyle(T.faint)
            ForEach([Interruption.meeting, .vitamins, .standUp, .transition, .sweep]) { a in
                Button(a.title) { queue.raise(a) }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(T.dim)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(T.card, in: RoundedRectangle(cornerRadius: 7))
            }
            Button("All at once") { queue.raiseAll() }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(T.text)
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(T.accentWash, in: RoundedRectangle(cornerRadius: 7))
            Button("Timer 10s") { queue.startTimer(minutes: 10.0 / 60.0) }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(T.dim)
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(T.card, in: RoundedRectangle(cornerRadius: 7))
        }
        .padding(8)
        .background(T.sidebar.opacity(0.95), in: Capsule())
        .overlay(Capsule().strokeBorder(T.line, lineWidth: 1))
        .padding(.bottom, 14)
        .shadow(color: .black.opacity(0.4), radius: 16, y: 4)
    }
}
