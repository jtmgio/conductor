// The reminder alert: the meeting alert's full-screen panel with a reminder card, plus a
// small corner panel for a running stand-up timer and its "sit down" card.
//
// Keys work like the meeting alert: the card's panel takes focus without activating the
// app and eats every key but esc. esc snoozes 5 minutes — it never clears a reminder for
// the day, so a stray press can't drop a stand-up (the browser hit that bug once).

import AppKit
import SwiftUI

final class ReminderModel: ObservableObject {
    @Published var reminder: Reminder?
}

private func symbol(_ icon: String?) -> String {
    switch icon {
    case "pill": return "pills.fill"
    case "syringe": return "syringe.fill"
    case "shake": return "waterbottle.fill"
    case "stretch": return "figure.stand"
    case "laptop": return "laptopcomputer"
    case "mail": return "envelope.fill"
    default: return "bell.fill"
    }
}

private let clock: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "h:mm a"
    return f
}()

struct ReminderCard: View {
    @ObservedObject var model: ReminderModel
    let onPrimary: () -> Void
    let onSecondary: () -> Void

    var body: some View {
        if let r = model.reminder {
            VStack(alignment: .leading, spacing: 28) {
                HStack(spacing: 10) {
                    Image(systemName: symbol(r.icon)).font(.system(size: 22)).foregroundStyle(Palette.accent)
                    Spacer()
                    Text(eyebrow(r)).font(.system(size: 15, weight: .semibold)).tracking(0.3)
                        .foregroundStyle(Palette.accent)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(r.label).font(.system(size: 52, weight: .bold)).tracking(-1)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    Text(subtitle(r)).font(.system(size: 18)).foregroundStyle(Palette.secondary)
                }
                HStack(spacing: 12) {
                    Button(action: onPrimary) {
                        Text(r.primaryLabel).font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Palette.accent, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .pointingHand()
                    Button(action: onSecondary) {
                        Text(r.isCritical ? "Snooze 5 min  esc" : "Skip").font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Palette.text)
                            .padding(.horizontal, 22).frame(minHeight: 56)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                    }
                    .pointingHand()
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
                if !r.isCritical {
                    Text("esc snoozes 5 min").font(.system(size: 14)).foregroundStyle(Palette.secondary)
                }
            }
            .padding(.vertical, 48).padding(.horizontal, 56)
            .frame(width: 600)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.border))
            .shadow(color: .black.opacity(0.5), radius: 40, y: 30)
            .foregroundStyle(Palette.text)
        }
    }

    private func eyebrow(_ r: Reminder) -> String {
        r.isCritical ? "DON'T SKIP THIS" : r.isTimed ? "TIME TO MOVE" : "REMINDER"
    }

    private func subtitle(_ r: Reminder) -> String {
        let t = clock.string(from: r.dueAt)
        return r.isTimed ? "\(t) · \(r.durationMin ?? 0) min" : t
    }
}

@MainActor
final class ReminderOverlay {
    private var panels: [AlertPanel] = []
    private let model = ReminderModel()
    private var onPrimary: () -> Void = {}
    private var onSecondary: () -> Void = {}
    private var onEscape: () -> Void = {}

    var shownId: String? { panels.isEmpty ? nil : model.reminder?.id }

    func show(_ r: Reminder, onPrimary: @escaping () -> Void, onSecondary: @escaping () -> Void,
              onEscape: @escaping () -> Void) {
        self.onPrimary = onPrimary
        self.onSecondary = onSecondary
        self.onEscape = onEscape
        model.reminder = r
        buildPanels()
    }

    func hide() {
        panels.forEach { $0.orderOut(nil) }
        panels = []
        model.reminder = nil
    }

    private func buildPanels() {
        panels.forEach { $0.orderOut(nil) }
        panels = []
        let main = NSScreen.screens.first  // the menu-bar display, as the meeting alert does
        for screen in NSScreen.screens {
            let isMain = screen == main
            let panel = AlertPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel],
                                   backing: .buffered, defer: false)
            // One below the meeting alert, so a meeting is on top even before we yield.
            panel.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue - 1)
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            panel.backgroundColor = .clear
            panel.isOpaque = false
            panel.hasShadow = false
            panel.isReleasedWhenClosed = false
            panel.becomesKeyOnlyIfNeeded = false
            panel.hidesOnDeactivate = false
            panel.onEscape = { [weak self] in self?.onEscape() }
            let content: AnyView = isMain
                ? AnyView(AlertBackdrop {
                    ReminderCard(model: model, onPrimary: { [weak self] in self?.onPrimary() },
                                 onSecondary: { [weak self] in self?.onSecondary() })
                })
                : AnyView(AlertBackdrop { EmptyView() })
            panel.contentView = NSHostingView(rootView: content)
            panel.setFrame(screen.frame, display: true)
            if isMain { panel.makeKeyAndOrderFront(nil) } else { panel.orderFrontRegardless() }
            panels.append(panel)
        }
    }
}

// MARK: - Corner timer

final class TimerModel: ObservableObject {
    @Published var label = ""
    @Published var icon: String?
    @Published var endsAt = Date()
    @Published var now = Date()
    /// Set when the countdown hit zero: the card shows this instead of the clock.
    @Published var doneText: String?
}

struct TimerCard: View {
    @ObservedObject var model: TimerModel
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: model.doneText == nil ? symbol(model.icon) : "checkmark.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(model.doneText == nil ? Palette.accent : Color.green)
            if let done = model.doneText {
                Text(done).font(.system(size: 17, weight: .semibold))
                Spacer(minLength: 8)
                Button(action: onClose) {
                    Text("Got it").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Color.green, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain).pointingHand()
            } else {
                Text(model.label).font(.system(size: 15, weight: .medium)).lineLimit(1)
                Spacer(minLength: 8)
                Text(mmss()).font(.system(size: 20, weight: .bold).monospacedDigit())
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .frame(width: 300)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.border))
        .foregroundStyle(Palette.text)
    }

    private func mmss() -> String {
        let s = max(0, Int(model.endsAt.timeIntervalSince(model.now).rounded(.up)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// Clicks reach the card, but it never takes focus — typing stays in your app.
private final class CornerPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class ReminderTimerPanel {
    private var panel: CornerPanel?
    private let model = TimerModel()
    private var closeTask: Task<Void, Never>?

    var isRunning: Bool { panel != nil && model.doneText == nil }

    func showCountdown(_ r: Reminder, endsAt: Date) {
        closeTask?.cancel()
        model.label = r.label
        model.icon = r.icon
        model.endsAt = endsAt
        model.now = Date()
        model.doneText = nil
        present()
    }

    func tick(now: Date) { model.now = now }

    /// "Sit down" for a stand-up, "<label> complete" otherwise; closes itself after 2 min.
    func showDone(_ r: Reminder) {
        model.doneText = r.label.range(of: "stand", options: .caseInsensitive) != nil
            ? "Sit down" : "\(r.label) complete"
        present()
        closeTask?.cancel()
        closeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 120 * 1_000_000_000)
            if !Task.isCancelled { self?.close() }
        }
    }

    func close() {
        closeTask?.cancel()
        panel?.orderOut(nil)
        panel = nil
    }

    private func present() {
        if panel == nil {
            let p = CornerPanel(contentRect: NSRect(x: 0, y: 0, width: 300, height: 60),
                                styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            p.level = .floating
            p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            p.backgroundColor = .clear
            p.isOpaque = false
            p.hasShadow = true
            p.isReleasedWhenClosed = false
            p.hidesOnDeactivate = false
            let host = NSHostingController(rootView: TimerCard(model: model, onClose: { [weak self] in self?.close() }))
            host.sizingOptions = [.preferredContentSize]
            p.contentViewController = host
            panel = p
        }
        guard let p = panel, let view = p.contentViewController?.view else { return }
        view.layoutSubtreeIfNeeded()
        let size = view.fittingSize
        let frame = NSScreen.screens.first?.visibleFrame ?? .zero
        p.setFrame(NSRect(x: frame.maxX - size.width - 16, y: frame.maxY - size.height - 16,
                          width: size.width, height: size.height), display: true)
        p.orderFrontRegardless()
    }
}
