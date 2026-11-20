// ⌃⌥M: today's meetings that haven't ended, the next one highlighted.
// Opens on the cached list at once, then refreshes. esc or ⌃⌥M again closes it.

import AppKit
import SwiftUI

final class PanelModel: ObservableObject {
    @Published var meetings: [Meeting] = []
    /// No fetch has landed today — say so, never "No more meetings today."
    @Published var unreachable = false
    @Published var now = Date()
}

struct MeetingPanelView: View {
    @ObservedObject var model: PanelModel

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Today").font(.system(size: 18, weight: .semibold))
                Spacer()
                Text("\(Self.dateFormatter.string(from: model.now)) · ⌃⌥M")
                    .font(.system(size: 14)).foregroundStyle(Palette.secondary)
            }
            .padding(.horizontal, 24).padding(.vertical, 20)
            Divider().overlay(Palette.border)

            VStack(spacing: 0) {
                if model.unreachable {
                    Text("Can't reach Conductor — meetings unknown.")
                        .font(.system(size: 15)).foregroundStyle(Palette.accent)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                } else if model.meetings.isEmpty {
                    Text("No more meetings today.")
                        .font(.system(size: 15)).foregroundStyle(Palette.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                ForEach(Array(model.meetings.enumerated()), id: \.element.id) { i, m in
                    row(m, isNext: i == 0)
                }
            }
            .padding(8)

            Divider().overlay(Palette.border)
            HStack {
                Spacer()
                Text("esc to close").font(.system(size: 13)).foregroundStyle(Palette.secondary)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
        }
        .frame(width: 560)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.border))
        .foregroundStyle(Palette.text)
    }

    private func row(_ m: Meeting, isNext: Bool) -> some View {
        let mins = Int(m.endsAt.timeIntervalSince(m.startsAt) / 60)
        let until = Int((m.startsAt.timeIntervalSince(model.now) / 60).rounded(.up))
        return HStack(spacing: 14) {
            Text(twelveHour(m.startTime))
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .frame(width: 64, alignment: .leading)
            Circle().fill(Color(hex: m.company.color)).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(m.title).font(.system(size: 16, weight: .medium)).lineLimit(1)
                Text("\(m.company.name) · \(mins) min").font(.system(size: 13)).foregroundStyle(Palette.secondary)
            }
            Spacer(minLength: 8)
            if isNext {
                Text(until > 0 ? "in \(until) min" : "now")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Palette.accent, in: Capsule())
            }
            if let url = m.joinURL {
                Button(action: { NSWorkspace.shared.open(url) }) {
                    Text("Join").font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .overlay(Capsule().stroke(Palette.line))
                }
                .buttonStyle(.plain)
                .pointingHand()
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(isNext ? Palette.raised : .clear, in: RoundedRectangle(cornerRadius: 10))
    }
}

@MainActor
final class MeetingPanelController {
    private var panel: AlertPanel?
    private let model = PanelModel()
    private weak var watcher: MeetingWatcher?

    nonisolated init() {}

    func toggle(watcher: MeetingWatcher) {
        if panel != nil { close(); return }
        render(watcher)
        let p = AlertPanel(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 200),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        // Above the meeting alert (.screenSaver) — the alert itself says "⌃⌥M for details".
        p.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 1)
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        p.backgroundColor = .clear
        p.isOpaque = false
        p.hasShadow = true
        p.isReleasedWhenClosed = false
        p.becomesKeyOnlyIfNeeded = false
        p.hidesOnDeactivate = false
        p.onEscape = { [weak self] in self?.close() }
        self.watcher = watcher
        let host = NSHostingController(rootView: MeetingPanelView(model: model))
        host.sizingOptions = [.preferredContentSize]
        p.contentViewController = host
        panel = p
        recenter()
        p.makeKeyAndOrderFront(nil)
        Task {
            await watcher.refresh()
            render(watcher)
            recenter()  // the refreshed list can change the height
        }
    }

    /// Center on the screen in use at its real size. center() before SwiftUI has sized the
    /// content centers an empty box, which then grows off to the right and down.
    private func recenter() {
        guard let p = panel, let view = p.contentViewController?.view else { return }
        view.layoutSubtreeIfNeeded()
        let size = view.fittingSize
        let screen = (NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }
            ?? NSScreen.main)?.visibleFrame ?? .zero
        p.setFrame(NSRect(x: screen.midX - size.width / 2, y: screen.midY - size.height / 2,
                          width: size.width, height: size.height), display: true)
    }

    private func render(_ watcher: MeetingWatcher) {
        model.now = Date()
        model.meetings = watcher.schedule.upcoming(now: model.now)
        model.unreachable = !watcher.schedule.loaded
    }

    private func close() {
        panel?.orderOut(nil)
        panel = nil
        watcher?.refocusAlert()  // esc must keep working on an alert that's still up
    }
}
