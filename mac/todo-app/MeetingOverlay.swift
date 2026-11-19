// The full-screen meeting alert: a dim panel on every screen, the card on the main one.
//
// Title-free on purpose — it may land on a screen share, so it never names the meeting
// or the company. Details live in the ⌃⌥M panel.
//
// Keys: the card's panel takes keyboard focus without activating the app (a
// non-activating panel, the Spotlight trick), so whatever app you were in stays in front.
// Every keystroke is swallowed except esc, which dismisses: typing mid-sentence can never
// snooze or dismiss it by accident.

import AppKit
import SwiftUI

/// "14:30" → "2:30".
func twelveHour(_ hhmm: String) -> String {
    let p = hhmm.split(separator: ":").compactMap { Int($0) }
    guard p.count == 2 else { return hhmm }
    let h = p[0] % 12 == 0 ? 12 : p[0] % 12
    return String(format: "%d:%02d", h, p[1])
}

func meridiem(_ hhmm: String) -> String {
    (Int(hhmm.split(separator: ":").first ?? "") ?? 0) >= 12 ? "PM" : "AM"
}

/// "10:00 – 10:30 AM", or "11:30 AM – 12:30 PM" across noon.
func timeRange(_ m: Meeting) -> String {
    let a = meridiem(m.startTime), b = meridiem(m.endTime)
    return a == b
        ? "\(twelveHour(m.startTime)) – \(twelveHour(m.endTime)) \(b)"
        : "\(twelveHour(m.startTime)) \(a) – \(twelveHour(m.endTime)) \(b)"
}

enum Palette {
    static let card = Color(hex: "#1E1E1B")
    static let border = Color(hex: "#333330")
    static let raised = Color(hex: "#2A2A26")
    static let accent = Color(hex: "#D4785A")
    static let ink = Color(hex: "#141413")
    static let text = Color(hex: "#E8E4DD")
    static let secondary = Color(hex: "#A8A29E")
    static let line = Color(hex: "#44443F")
}

final class OverlayModel: ObservableObject {
    @Published var meeting: Meeting?
    @Published var now = Date()
}

/// Takes focus without activating the app; eats every key but esc.
final class AlertPanel: NSPanel {
    var onEscape: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown {
            if event.keyCode == 53 { onEscape?() }  // esc
            return
        }
        super.sendEvent(event)
    }
}

struct AlertCard: View {
    @ObservedObject var model: OverlayModel
    let onSnooze: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        if let m = model.meeting {
            VStack(alignment: .leading, spacing: 28) {
                HStack {
                    Circle().fill(Color(hex: m.company.color)).frame(width: 12, height: 12)
                    Spacer()
                    Text("MEETING IN").font(.system(size: 15, weight: .semibold)).tracking(0.3)
                        .foregroundStyle(Palette.accent)
                }
                countdown(m)
                Text(timeRange(m)).font(.system(size: 22, weight: .medium)).foregroundStyle(Palette.secondary)
                HStack(spacing: 12) {
                    Button(action: onSnooze) {
                        Text("Snooze 1 min").font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Palette.accent, in: RoundedRectangle(cornerRadius: 12))
                    }
                    Button(action: onDismiss) {
                        Text("Dismiss  esc").font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Palette.text)
                            .padding(.horizontal, 22).frame(minHeight: 56)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                    }
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
                Text("⌃⌥M for details").font(.system(size: 14)).foregroundStyle(Palette.secondary)
            }
            .padding(.vertical, 48).padding(.horizontal, 56)
            .frame(width: 680)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.border))
            .shadow(color: .black.opacity(0.5), radius: 40, y: 30)
            .foregroundStyle(Palette.text)
        }
    }

    @ViewBuilder private func countdown(_ m: Meeting) -> some View {
        let text = MeetingSchedule.countdown(m, now: model.now)
        if text == "Starting now" {
            Text(text).font(.system(size: 88, weight: .bold)).tracking(-2)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text(text.replacingOccurrences(of: " min", with: ""))
                    .font(.system(size: 120, weight: .bold)).tracking(-4)
                Text("min").font(.system(size: 32, weight: .medium)).foregroundStyle(Color(hex: "#C9C4BC"))
            }
        }
    }
}

struct AlertBackdrop<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        ZStack {
            Color(red: 12 / 255, green: 12 / 255, blue: 11 / 255).opacity(0.82)
            content
        }
        .ignoresSafeArea()
    }
}

@MainActor
final class MeetingOverlay {
    private var panels: [AlertPanel] = []
    private let model = OverlayModel()
    private var chimed: Set<String> = []
    private var onSnooze: () -> Void = {}
    private var onDismiss: () -> Void = {}
    private var screenObserver: NSObjectProtocol?

    func show(meeting: Meeting, now: Date, onSnooze: @escaping () -> Void, onDismiss: @escaping () -> Void) {
        self.onSnooze = onSnooze
        self.onDismiss = onDismiss
        model.meeting = meeting
        model.now = now
        if !chimed.contains(meeting.id) {
            chimed.insert(meeting.id)
            NSSound(named: "Glass")?.play()
        }
        buildPanels()
        if screenObserver == nil {
            screenObserver = NotificationCenter.default.addObserver(
                forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    guard let self, !self.panels.isEmpty else { return }
                    self.buildPanels()
                }
            }
        }
    }

    func update(now: Date) {
        model.now = now
    }

    func hide() {
        panels.forEach { $0.orderOut(nil) }
        panels = []
        model.meeting = nil
    }

    private func buildPanels() {
        panels.forEach { $0.orderOut(nil) }
        panels = []
        let main = NSScreen.main ?? NSScreen.screens.first
        for screen in NSScreen.screens {
            let isMain = screen == main
            let panel = AlertPanel(
                contentRect: screen.frame,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            panel.level = .screenSaver
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            panel.backgroundColor = .clear
            panel.isOpaque = false
            panel.hasShadow = false
            panel.isReleasedWhenClosed = false
            panel.becomesKeyOnlyIfNeeded = false
            panel.hidesOnDeactivate = false
            panel.onEscape = { [weak self] in self?.onDismiss() }
            let content: AnyView = isMain
                ? AnyView(AlertBackdrop {
                    AlertCard(model: model, onSnooze: { [weak self] in self?.onSnooze() },
                              onDismiss: { [weak self] in self?.onDismiss() })
                })
                : AnyView(AlertBackdrop { EmptyView() })
            panel.contentView = NSHostingView(rootView: content)
            panel.setFrame(screen.frame, display: true)
            if isMain { panel.makeKeyAndOrderFront(nil) } else { panel.orderFrontRegardless() }
            panels.append(panel)
        }
    }
}
