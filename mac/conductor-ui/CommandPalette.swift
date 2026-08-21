import SwiftUI

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

struct CommandPalette: View {
    @Binding var isPresented: Bool
    var onGo: (Screen) -> Void

    @State private var query = ""
    @State private var selected = 0
    @FocusState private var focused: Bool

    private var actions: [PaletteRow] {
        [
            .init(icon: "plus.circle", label: "Add task", shortcut: "⌘N", section: "Actions"),
            .init(icon: "paperplane", label: "Format a message", shortcut: "⌘3", section: "Actions"),
            .init(icon: "moon.stars", label: "Plan tomorrow", section: "Actions"),
            .init(icon: "scope", label: "Go to Today", shortcut: "⌘1", section: "Go"),
            .init(icon: "rectangle.split.3x1", label: "Go to Board", shortcut: "⌘2", section: "Go"),
            .init(icon: "paperplane", label: "Go to Formatter", shortcut: "⌘3", section: "Go"),
            .init(icon: "calendar", label: "Go to Meetings", shortcut: "⌘4", section: "Go"),
            .init(icon: "gearshape", label: "Go to Settings", shortcut: "⌘,", section: "Go"),
        ]
    }

    private var taskHits: [PaletteRow] {
        guard !query.isEmpty else { return [] }
        return Sample.upNext
            .filter { $0.title.localizedCaseInsensitiveContains(query) || $0.key.localizedCaseInsensitiveContains(query) }
            .prefix(5)
            .map { job in
                PaletteRow(icon: "checkmark.circle", label: job.title,
                           trailing: job.key,
                           tint: job.overdue ? T.alarm : nil,
                           section: "Tasks")
            }
    }

    private var followUpHits: [PaletteRow] {
        guard !query.isEmpty else { return [] }
        let waiting: [(String, String)] = [
            ("Champion slate blessing", "Jeff White"),
            ("Three blocking SME answers", "Luke Freudenthal"),
            ("Lower tier + credit on the renewal", "Milos · UXCam"),
        ]
        return waiting
            .filter { $0.0.localizedCaseInsensitiveContains(query) || $0.1.localizedCaseInsensitiveContains(query) }
            .map { PaletteRow(icon: "clock", label: $0.0, trailing: $0.1, section: "Waiting on") }
    }

    private var rows: [PaletteRow] {
        let filteredActions = query.isEmpty
            ? actions
            : actions.filter { $0.label.localizedCaseInsensitiveContains(query) }
        var all = filteredActions + taskHits + followUpHits
        if !query.isEmpty {
            all.append(.init(icon: "sparkles",
                             label: "Ask AI about “\(query)”",
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

            panel
                .padding(.top, 96)
                .transition(.scale(scale: 0.97).combined(with: .opacity))
        }
        .onExitCommand { close() }
        .onMoveCommand { direction in
            switch direction {
            case .down: selected = min(selected + 1, max(0, rows.count - 1))
            case .up:   selected = max(selected - 1, 0)
            default: break
            }
        }
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15))
                    .foregroundStyle(T.faint)
                TextField("Search tasks, follow-ups, notes, transcripts…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16))
                    .foregroundStyle(T.text)
                    .focused($focused)
                    .onSubmit { run(rows.indices.contains(selected) ? rows[selected] : nil) }
                    .onChange(of: query) { _ in selected = 0 }
                Text("esc")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(T.faint)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(T.sunken, in: RoundedRectangle(cornerRadius: 5))
            }
            .padding(.horizontal, 18).padding(.vertical, 16)

            Divider().overlay(T.line)

            if rows.isEmpty {
                Text("Nothing matches “\(query)”")
                    .font(.system(size: 13.5)).foregroundStyle(T.faint)
                    .frame(maxWidth: .infinity).padding(.vertical, 34)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                            if i == 0 || rows[i - 1].section != row.section {
                                Cap(row.section)
                                    .padding(.horizontal, 18)
                                    .padding(.top, i == 0 ? 12 : 14)
                                    .padding(.bottom, 4)
                            }
                            rowView(row, active: i == selected)
                                .onHover { if $0 { selected = i } }
                                .onTapGesture { run(row) }
                        }
                    }
                    .padding(.bottom, 10)
                }
                .frame(maxHeight: 380)
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
        .onAppear { focused = true; selected = 0 }
    }

    private func rowView(_ row: PaletteRow, active: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: row.icon)
                .font(.system(size: 14))
                .foregroundStyle(row.tint ?? (active ? T.text : T.dim))
                .frame(width: 18)
            Text(row.label)
                .font(.system(size: 14.5))
                .foregroundStyle(row.tint ?? T.text)
                .lineLimit(1)
            Spacer(minLength: 12)
            if let trailing = row.trailing {
                Text(trailing)
                    .font(.system(size: 12, design: row.section == "Tasks" ? .monospaced : .default))
                    .foregroundStyle(T.faint)
            }
            if let shortcut = row.shortcut {
                Text(shortcut)
                    .font(.system(size: 11.5, weight: .medium))
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
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(T.dim)
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 4))
            Text(what).font(.system(size: 11.5)).foregroundStyle(T.faint)
        }
    }

    private func run(_ row: PaletteRow?) {
        guard let row else { close(); return }
        switch row.label {
        case "Go to Today", "Plan tomorrow": onGo(.today)
        case "Go to Board":                  onGo(.board)
        case "Go to Formatter",
             "Format a message":             onGo(.formatter)
        case "Go to Meetings":               onGo(.meetings)
        case "Go to Settings":               onGo(.settings)
        default: break
        }
        close()
    }

    private func close() {
        query = ""
        selected = 0
        isPresented = false
    }
}
