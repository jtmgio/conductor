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
                Button("Formatter") { NotificationCenter.default.post(name: .goTo, object: Screen.formatter) }
                    .keyboardShortcut("3", modifiers: .command)
                Button("Meetings")  { NotificationCenter.default.post(name: .goTo, object: Screen.meetings) }
                    .keyboardShortcut("4", modifiers: .command)
                Divider()
                Button("Settings")  { NotificationCenter.default.post(name: .goTo, object: Screen.settings) }
                    .keyboardShortcut(",", modifiers: .command)
            }
            CommandGroup(after: .toolbar) {
                Button("Find Anything…") { NotificationCenter.default.post(name: .openPalette, object: nil) }
                    .keyboardShortcut("k", modifiers: .command)
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
    static let openPalette = Notification.Name("conductor.openPalette")
    static let toggleSidebar = Notification.Name("conductor.toggleSidebar")
}

struct Shell: View {
    @State private var screen: Screen = .today
    @State private var collapsed = false
    @StateObject private var queue = AlertQueue()
    @StateObject private var ui = UISettings()
    @StateObject private var sheets = Sheets()
    @State private var palette = false

    var body: some View {
        HStack(spacing: 0) {
            Sidebar(screen: $screen, collapsed: $collapsed)

            ZStack(alignment: .topTrailing) {
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .id("\(screen.rawValue)-\(ui.theme.rawValue)-\(ui.scale)")
                    .transition(.opacity)

                TimerPill(queue: queue).padding(.top, 14).padding(.trailing, 18)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(T.ground)
            .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 46) }
        }
        .id("shell-\(ui.theme.rawValue)-\(ui.scale)")
        .overlay(AlertOverlay(queue: queue))
        .overlay {
            if palette {
                CommandPalette(isPresented: $palette) { screen = $0 }
            }
        }
        .overlay(alignment: .bottom) { demoTray }
        .sheet(isPresented: $sheets.planning) {
            PlanTomorrowSheet(isPresented: $sheets.planning).environmentObject(ui).environmentObject(sheets)
        }
        .sheet(item: $sheets.openJob) { job in
            TaskDetailSheet(isPresented: Binding(
                get: { sheets.openJob != nil },
                set: { if !$0 { sheets.openJob = nil } }
            ), job: job, company: sheets.openCompany)
            .environmentObject(ui).environmentObject(sheets)
        }
        .animation(T.quick, value: palette)
        .animation(T.ease, value: screen)
        .animation(T.ease, value: collapsed)
        .onReceive(NotificationCenter.default.publisher(for: .goTo)) { note in
            if let s = note.object as? Screen { screen = s }
        }
        .onReceive(NotificationCenter.default.publisher(for: .toggleSidebar)) { _ in
            collapsed.toggle()
        }
        .onReceive(NotificationCenter.default.publisher(for: .openPalette)) { _ in
            // Never open underneath an alert — that was the web version's bug.
            guard queue.current == nil else { return }
            palette = true
        }
        // Outermost, so every overlay and sheet is inside the subtree that
        // actually has these objects.
        .environmentObject(ui)
        .environmentObject(sheets)
    }

    @ViewBuilder private var content: some View {
        switch screen {
        case .today:     TodayView()
        case .board:     BoardView()
        case .formatter: FormatterView()
        case .meetings:  MeetingsView()
        case .settings:  SettingsView()
        }
    }

    /// Prototype-only. Nothing schedules these, so there has to be a way to
    /// fire them by hand.
    private var demoTray: some View {
        HStack(spacing: 6) {
            Text("Fire:").font(.system(size: T.s(11))).foregroundStyle(T.faint)
            ForEach([Interruption.meeting, .vitamins, .standUp, .transition, .sweep]) { a in
                Button(a.title) { queue.raise(a) }
                    .buttonStyle(.plain)
                    .font(.system(size: T.s(11)))
                    .foregroundStyle(T.dim)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(T.card, in: RoundedRectangle(cornerRadius: 7))
            }
            Button("All at once") { queue.raiseAll() }
                .buttonStyle(.plain)
                .font(.system(size: T.s(11), weight: .medium))
                .foregroundStyle(T.text)
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(T.accentWash, in: RoundedRectangle(cornerRadius: 7))
            Button("Timer 10s") { queue.startTimer(minutes: 10.0 / 60.0) }
                .buttonStyle(.plain)
                .font(.system(size: T.s(11)))
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
