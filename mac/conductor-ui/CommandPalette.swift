import SwiftUI
import AppKit

/// ⌘K — one field that does everything.
///
/// Three things live behind it: jump somewhere, do something, or find something.
/// Empty, it offers the actions. Type, and it filters those and searches tasks
/// and follow-ups underneath, with "Ask AI" as the last resort at the bottom.
///
/// Note it renders ABOVE the alert layer, unlike the web version — there
/// GlobalSearch sits at z-[60], below all four alerts, so ⌘K during one opened
/// the palette behind an opaque backdrop and you typed into a field you
/// couldn't see. Here it simply can't open while an alert holds the screen.
struct PaletteRow: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    var trailing: String? = nil
    var shortcut: String? = nil
    var tint: Color? = nil
    var section: String
}

/// The palette is one window with three faces: search, capture a task, or
/// format a message. Sub-modes rather than separate windows, because the
/// point of ⌘K is that it's the same keystroke every time.
enum PaletteMode { case search, addTask, formatMessage }

/// Palette state lives in a reference type on purpose.
///
/// The key monitor is an escaping closure, and m.when this was @State on the
/// view it captured a *copy* of the struct — so after switching to Add task
/// the closure kept reading m.mode == .addTask forever. Coming back to search,
/// `guard m.mode == .search` failed and the arrow keys fell through to the text
/// field. A class is read live, every time.
@MainActor
final class PaletteModel: ObservableObject {
    @Published var mode: PaletteMode = .search
    @Published var query = ""
    @Published var selected = 0
    @Published var draftTitle = ""
    @Published var draftBody = ""
    @Published var when = "Backlog"
    @Published var platform = "Slack"
    @Published var company = Sample.companies[0].id
    @Published var scrollTo: UUID?

    func reset() {
        mode = .search
        query = ""
        selected = 0
        draftTitle = ""
        draftBody = ""
        when = "Backlog"
        scrollTo = nil
    }
}

struct CommandPalette: View {
    @Binding var isPresented: Bool
    var onGo: (Screen) -> Void
    @EnvironmentObject var sheets: Sheets

    @StateObject private var m = PaletteModel()
    @State private var monitor: Any?
    @FocusState private var focused: Bool

    private var actions: [PaletteRow] {
        [
            .init(icon: "plus.circle", label: "Add task", shortcut: "⌘N", section: "Actions"),
            .init(icon: "paperplane", label: "Format a message", shortcut: "⌘4", section: "Actions"),
            .init(icon: "moon.stars", label: "Plan tomorrow", shortcut: "⌘3", section: "Actions"),
            .init(icon: "scope", label: "Go to Today", shortcut: "⌘1", section: "Go"),
            .init(icon: "rectangle.split.3x1", label: "Go to Board", shortcut: "⌘2", section: "Go"),
            .init(icon: "moon.stars", label: "Go to Plan", shortcut: "⌘3", section: "Go"),
            .init(icon: "paperplane", label: "Go to Formatter", shortcut: "⌘4", section: "Go"),
            .init(icon: "calendar", label: "Go to Meetings", shortcut: "⌘5", section: "Go"),
            .init(icon: "gearshape", label: "Go to Settings", shortcut: "⌘,", section: "Go"),
        ]
    }

    private var taskHits: [PaletteRow] {
        guard !m.query.isEmpty else { return [] }
        return Sample.upNext
            .filter { $0.title.localizedCaseInsensitiveContains(m.query) || $0.key.localizedCaseInsensitiveContains(m.query) }
            .prefix(5)
            .map { job in
                PaletteRow(icon: "checkmark.circle", label: job.title,
                           trailing: job.key,
                           tint: job.overdue ? T.alarm : nil,
                           section: "Tasks")
            }
    }

    private var followUpHits: [PaletteRow] {
        guard !m.query.isEmpty else { return [] }
        let waiting: [(String, String)] = [
            ("Champion slate blessing", "Jeff White"),
            ("Three blocking SME answers", "Luke Freudenthal"),
            ("Lower tier + credit on the renewal", "Milos · UXCam"),
        ]
        return waiting
            .filter { $0.0.localizedCaseInsensitiveContains(m.query) || $0.1.localizedCaseInsensitiveContains(m.query) }
            .map { PaletteRow(icon: "clock", label: $0.0, trailing: $0.1, section: "Waiting on") }
    }

    private var rows: [PaletteRow] {
        let filteredActions = m.query.isEmpty
            ? actions
            : actions.filter { $0.label.localizedCaseInsensitiveContains(m.query) }
        var all = filteredActions + taskHits + followUpHits
        if !m.query.isEmpty {
            all.append(.init(icon: "sparkles",
                             label: "Ask AI about “\(m.query)”",
                             tint: T.accent,
                             section: "Ask"))
        }
        return all
    }

    var body: some View {
        ZStack(alignment: .top) {
            Rectangle()
                .fill(.black.opacity(0.35))
                .ignoresSafeArea()
                .onTapGesture { close() }

            Group {
                switch m.mode {
                case .search:        panel
                case .addTask:       addTaskPanel
                case .formatMessage: formatPanel
                }
            }
                .padding(.top, 96)
                .transition(.scale(scale: 0.97).combined(with: .opacity))
        }
        // onMoveCommand never fires here: the focused TextField consumes arrow
        // keys to move its own insertion point, so the palette never sees them.
        // A local monitor gets first refusal and swallows the ones we own.
        .onAppear { installKeyMonitor() }
        .onDisappear { removeKeyMonitor() }
    }

    private func installKeyMonitor() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            switch event.keyCode {
            case 125:  // down
                guard m.mode == .search else { return event }
                move(1)
                return nil
            case 126:  // up
                guard m.mode == .search else { return event }
                move(-1)
                return nil
            case 36, 76:  // return, keypad enter
                if m.mode == .search {
                    run(rows.indices.contains(m.selected) ? rows[m.selected] : nil)
                    return nil
                }
                // In a composer, plain Return makes a newline; ⌘Return submits.
                if event.modifierFlags.contains(.command) { close(); return nil }
                return event
            case 53:  // escape
                back()
                return nil
            default:
                return event
            }
        }
    }

    private func removeKeyMonitor() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    private func move(_ delta: Int) {
        guard !rows.isEmpty else { return }
        // Wraps, so holding down doesn't dead-end at the bottom.
        m.selected = (m.selected + delta + rows.count) % rows.count
        m.scrollTo = rows[m.selected].id
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: T.s(15)))
                    .foregroundStyle(T.faint)
                TextField("Search tasks, follow-ups, notes, transcripts…", text: $m.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: T.s(16)))
                    .foregroundStyle(T.text)
                    .focused($focused)
                    .onSubmit { run(rows.indices.contains(m.selected) ? rows[m.selected] : nil) }
                    .onChange(of: m.query) { _ in m.selected = 0 }
                Text("esc")
                    .font(.system(size: T.s(11), weight: .medium))
                    .foregroundStyle(T.faint)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(T.sunken, in: RoundedRectangle(cornerRadius: 5))
            }
            .padding(.horizontal, 18).padding(.vertical, 16)

            Divider().overlay(T.line)

            if rows.isEmpty {
                Text("Nothing matches “\(m.query)”")
                    .font(.system(size: T.s(13.5))).foregroundStyle(T.faint)
                    .frame(maxWidth: .infinity).padding(.vertical, 34)
            } else {
                ScrollViewReader { proxy in
                  ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                            if i == 0 || rows[i - 1].section != row.section {
                                Cap(row.section)
                                    .padding(.horizontal, 18)
                                    .padding(.top, i == 0 ? 12 : 14)
                                    .padding(.bottom, 4)
                            }
                            rowView(row, active: i == m.selected)
                                .id(row.id)
                                .onHover { if $0 { m.selected = i } }
                                .onTapGesture { run(row) }
                        }
                    }
                    .padding(.bottom, 10)
                  }
                  .frame(maxHeight: 380)
                  .onChange(of: m.scrollTo) { target in
                      guard let target else { return }
                      withAnimation(T.quick) { proxy.scrollTo(target, anchor: .center) }
                  }
                }
            }

            Divider().overlay(T.line)
            HStack(spacing: 14) {
                hint("↑↓", "navigate")
                hint("↩", "open")
                hint("esc", "close")
                Spacer()
            }
            .padding(.horizontal, 18).padding(.vertical, 10)
        }
        .frame(width: 620)
        .background(T.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(T.lineFirm, lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 44, y: 18)
        .onAppear { focused = true; m.selected = 0 }
    }


    // ── Add task ─────────────────────────────────────────────────────────
    private var addTaskPanel: some View {
        VStack(spacing: 0) {
            modeHeader(icon: "plus.circle", title: "Add task")

            VStack(alignment: .leading, spacing: 14) {
                TextField("What needs doing?", text: $m.draftTitle, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: T.s(17)))
                    .foregroundStyle(T.text)
                    .lineLimit(1...4)
                    .focused($focused)

                if !m.draftTitle.isEmpty {
                    TextField("Notes — anything you'd lose otherwise", text: $m.draftBody, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: T.s(13.5)))
                        .foregroundStyle(T.dim)
                        .lineLimit(1...3)
                }

                Cap("Company")
                CompanyPicker(selected: $m.company)

                Cap("When")
                HStack(spacing: 6) {
                    // Backlog first, and it's the default. A capture box that
                    // defaults to Today is how today's list becomes a pile.
                    ForEach(["Backlog", "Today", "Tomorrow", "Monday"], id: \.self) { w in
                        Button { m.when = w } label: {
                            Text(w)
                                .font(.system(size: T.s(12.5), weight: m.when == w ? .medium : .regular))
                                .foregroundStyle(m.when == w ? T.text : T.dim)
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(
                                    Capsule().fill(m.when == w ? T.card : T.sunken)
                                        .overlay(Capsule().strokeBorder(m.when == w ? T.lineFirm : T.line, lineWidth: 1))
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)

            Divider().overlay(T.line)
            HStack(spacing: 12) {
                hint("esc", "back to search")
                Spacer()
                Text(refineNote)
                    .font(.system(size: T.s(11.5))).foregroundStyle(T.faint)
                Button { close() } label: {
                    HStack(spacing: 7) {
                        Text("Add task").font(.system(size: T.s(13.5), weight: .semibold))
                        Text("⌘↩").font(.system(size: T.s(11), weight: .semibold)).opacity(0.55)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(m.draftTitle.isEmpty ? T.sunken : T.accent, in: RoundedRectangle(cornerRadius: 9))
                    .foregroundStyle(m.draftTitle.isEmpty ? T.faint : T.hex(0x17150F))
                }
                .buttonStyle(.plain)
                .disabled(m.draftTitle.isEmpty)
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
        }
        .frame(width: 620)
        .background(T.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(T.lineFirm, lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 44, y: 18)
        .onAppear { focused = true }
    }

    /// The real capture path runs the raw text through a refiner, so say so —
    /// otherwise a long brain-dump looks like it will land as a long title.
    private var refineNote: String {
        m.draftTitle.count > 90 ? "Long — it'll be shortened and the full text kept in notes" : ""
    }

    // ── Format a message ─────────────────────────────────────────────────
    private var formatPanel: some View {
        VStack(spacing: 0) {
            modeHeader(icon: "paperplane", title: "Format a message")

            VStack(alignment: .leading, spacing: 14) {
                TextField("Paste your rough message…", text: $m.draftBody, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: T.s(14.5)))
                    .foregroundStyle(T.text)
                    .lineLimit(4...10)
                    .focused($focused)
                    .padding(12)
                    .background(T.sunken, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(T.line, lineWidth: 1))

                Cap("Voice")
                CompanyPicker(selected: $m.company)

                Cap("Platform")
                HStack(spacing: 3) {
                    ForEach(["Slack", "Teams", "Email", "SMS"], id: \.self) { p in
                        Button { m.platform = p } label: {
                            Text(p)
                                .font(.system(size: T.s(12), weight: m.platform == p ? .medium : .regular))
                                .foregroundStyle(m.platform == p ? T.text : T.faint)
                                .padding(.horizontal, 11).padding(.vertical, 5)
                                .background(RoundedRectangle(cornerRadius: 6).fill(m.platform == p ? T.card : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 8))
            }
            .padding(18)

            Divider().overlay(T.line)
            HStack(spacing: 12) {
                hint("esc", "back to search")
                Spacer()
                // The clipboard is the deliverable — this is the whole flow.
                Text("Lands on your clipboard").font(.system(size: T.s(11.5))).foregroundStyle(T.faint)
                Button { close() } label: {
                    HStack(spacing: 7) {
                        Text("Format & copy").font(.system(size: T.s(13.5), weight: .semibold))
                        Text("⌘↩").font(.system(size: T.s(11), weight: .semibold)).opacity(0.55)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(m.draftBody.isEmpty ? T.sunken : T.accent, in: RoundedRectangle(cornerRadius: 9))
                    .foregroundStyle(m.draftBody.isEmpty ? T.faint : T.hex(0x17150F))
                }
                .buttonStyle(.plain)
                .disabled(m.draftBody.isEmpty)
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
        }
        .frame(width: 620)
        .background(T.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(T.lineFirm, lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 44, y: 18)
        .onAppear { focused = true }
    }

    private func modeHeader(icon: String, title: String) -> some View {
        HStack(spacing: 11) {
            Button { back() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: T.s(13), weight: .semibold))
                    .foregroundStyle(T.faint)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            Image(systemName: icon).font(.system(size: T.s(14))).foregroundStyle(T.accent)
            Text(title).font(.system(size: T.s(15), weight: .semibold)).foregroundStyle(T.text)
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .overlay(alignment: .bottom) { Rectangle().fill(T.line).frame(height: 1) }
    }

    private func rowView(_ row: PaletteRow, active: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: row.icon)
                .font(.system(size: T.s(14)))
                .foregroundStyle(row.tint ?? (active ? T.text : T.dim))
                .frame(width: 18)
            Text(row.label)
                .font(.system(size: T.s(14.5)))
                .foregroundStyle(row.tint ?? T.text)
                .lineLimit(1)
            Spacer(minLength: 12)
            if let trailing = row.trailing {
                Text(trailing)
                    .font(.system(size: T.s(12), design: row.section == "Tasks" ? .monospaced : .default))
                    .foregroundStyle(T.faint)
            }
            if let shortcut = row.shortcut {
                Text(shortcut)
                    .font(.system(size: T.s(11.5), weight: .medium))
                    .foregroundStyle(T.faint)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(T.sunken, in: RoundedRectangle(cornerRadius: 5))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 9)
                .fill(active ? T.accentWash : .clear)
        )
        .padding(.horizontal, 8)
        .contentShape(Rectangle())
    }

    private func hint(_ key: String, _ what: String) -> some View {
        HStack(spacing: 6) {
            Text(key)
                .font(.system(size: T.s(10.5), weight: .medium))
                .foregroundStyle(T.dim)
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 4))
            Text(what).font(.system(size: T.s(11.5))).foregroundStyle(T.faint)
        }
    }

    private func run(_ row: PaletteRow?) {
        guard let row else { close(); return }
        switch row.label {
        case "Add task":
            withAnimation(T.quick) { m.mode = .addTask }
            return
        case "Format a message":
            withAnimation(T.quick) { m.mode = .formatMessage }
            return
        case "Plan tomorrow", "Go to Plan": onGo(.plan)
        case "Go to Today":    onGo(.today)
        case "Go to Board":    onGo(.board)
        case "Go to Formatter": onGo(.formatter)
        case "Go to Meetings": onGo(.meetings)
        case "Go to Settings": onGo(.settings)
        default: break
        }
        close()
    }

    /// Escape steps back to search before it closes the window — one keystroke
    /// shouldn't throw away a half-typed task.
    private func back() {
        if m.mode == .search { close() }
        else { withAnimation(T.quick) { m.mode = .search } }
    }

    private func close() {
        m.reset()
        isPresented = false
    }
}
