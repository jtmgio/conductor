import SwiftUI

/// What kind of interruption this is, and how loudly it may shout.
enum Interruption: Int, Identifiable, CaseIterable {
    // Lower rank wins the screen.
    case meeting = 1, vitamins = 2, standUp = 3, transition = 4, sweep = 5, complete = 6
    var id: Int { rawValue }

    var eyebrow: String {
        switch self {
        case .meeting:    return "Starting now"
        case .vitamins:   return "Don't skip this"
        case .standUp:    return "Time to move"
        case .transition: return "Changing companies"
        case .sweep:      return "Two sweeps missed"
        case .complete:   return "Nice"
        }
    }

    var title: String {
        switch self {
        case .meeting:    return "API Team Daily"
        case .vitamins:   return "Take vitamins"
        case .standUp:    return "Stand up"
        case .transition: return "Park it before you go"
        case .sweep:      return "Check your messages"
        case .complete:   return "Stand up complete"
        }
    }

    var detail: String {
        switch self {
        case .meeting:    return "vQuip · 10:30 – 11:00 · Google Meet"
        case .vitamins:   return "9:45 AM · comes back until it's done"
        case .standUp:    return "10:00 AM · 15 min · timer runs in the corner"
        case .transition: return "Anything you type files itself against vQuip."
        case .sweep:      return "Clear these three and it goes quiet for twenty minutes."
        case .complete:   return "Sit back down. Next one at 11:30."
        }
    }

    var glyph: String {
        switch self {
        case .meeting:    return "calendar"
        case .vitamins:   return "pills"
        case .standUp:    return "figure.stand"
        case .transition: return "arrow.right.circle"
        case .sweep:      return "bubble.left.and.bubble.right"
        case .complete:   return "checkmark"
        }
    }

    var tone: Color {
        switch self {
        case .meeting:    return T.accent
        case .vitamins,
             .standUp:    return T.amber
        case .transition: return T.hex(0x2DD4B0)
        case .sweep:      return T.amber
        case .complete:   return T.go
        }
    }

    var primary: String {
        switch self {
        case .meeting: return "Join"
        case .vitamins: return "Taken"
        case .standUp: return "Start"
        case .transition: return "Start Zeta Global"
        case .sweep: return "Swept"
        case .complete: return "Sit down"
        }
    }

    /// Critical reminders can be deferred but not dismissed.
    var secondary: String? {
        switch self {
        case .meeting: return "Got it"
        case .vitamins: return "Snooze 5 min"
        case .standUp: return "Skip today"
        case .transition: return "Skip"
        case .sweep: return "Snooze 20 min"
        case .complete: return nil
        }
    }

    var escapable: Bool { self != .vitamins }
}

/// One owner of the screen.
///
/// The web app mounts four independent overlays that don't know about each
/// other — two of them tie on z-index, so which you see is decided by DOM
/// order and dismissing one can reveal a second you never knew was queued.
/// Here there is a single queue, ordered by rank, showing one at a time.
@MainActor
final class AlertQueue: ObservableObject {
    @Published private(set) var current: Interruption?
    @Published private(set) var waiting: [Interruption] = []
    @Published var timerEnds: Date?
    @Published var timerLabel = "Stand up"

    func raise(_ a: Interruption) {
        guard current != a, !waiting.contains(a) else { return }
        if current == nil { current = a }
        else { waiting.append(a); waiting.sort { $0.rawValue < $1.rawValue } }
        promoteIfOutranked()
    }

    func raiseAll() { Interruption.allCases.filter { $0 != .complete }.forEach(raise) }

    /// A meeting starting beats a stand-up, whatever arrived first.
    private func promoteIfOutranked() {
        guard let now = current, let best = waiting.first, best.rawValue < now.rawValue else { return }
        waiting.removeFirst()
        waiting.append(now)
        waiting.sort { $0.rawValue < $1.rawValue }
        current = best
    }

    func dismiss() {
        if current == .standUp { startTimer(minutes: 15) }
        current = waiting.isEmpty ? nil : waiting.removeFirst()
    }

    func startTimer(minutes: Double) {
        // An absolute end time, not seconds remaining — a window that gets
        // backgrounded can't stretch fifteen minutes into twenty.
        timerEnds = Date().addingTimeInterval(minutes * 60)
    }

    func finishTimer() {
        timerEnds = nil
        raise(.complete)
    }

    var queuedNote: String? {
        switch waiting.count {
        case 0: return nil
        case 1: return "One more after this"
        case 2: return "Two more after this"
        default: return "\(waiting.count) more after this"
        }
    }
}

struct AlertOverlay: View {
    @ObservedObject var queue: AlertQueue
    @State private var parked = ""

    var body: some View {
        ZStack {
            if let alert = queue.current {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .ignoresSafeArea()
                    .onTapGesture { if alert.escapable { queue.dismiss() } }

                card(alert)
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
            }
        }
        .animation(T.ease, value: queue.current)
    }

    private func card(_ a: Interruption) -> some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 18)
                .fill(a.tone.opacity(0.15))
                .frame(width: 64, height: 64)
                .overlay(Image(systemName: a.glyph).font(.system(size: 26, weight: .medium)).foregroundStyle(a.tone))
                .padding(.bottom, 18)

            Text(a.eyebrow.uppercased())
                .font(.system(size: 12, weight: .semibold)).tracking(0.9)
                .foregroundStyle(a.tone)

            Text(a.title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(T.text)
                .multilineTextAlignment(.center)
                .padding(.top, 6)

            Text(a.detail)
                .font(.system(size: 13.5))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)

            if a == .meeting || a == .standUp {
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    Text(a == .meeting ? "2:00" : "15:00")
                        .font(.system(size: 30, weight: .bold).monospacedDigit())
                        .foregroundStyle(T.text)
                    Text(a == .meeting ? "until it starts" : "on your feet")
                        .font(.system(size: 13.5, weight: .semibold)).foregroundStyle(a.tone)
                }
                .padding(.top, 18)
            }

            if a == .transition { handover.padding(.top, 18); parkField.padding(.top, 16) }
            if a == .sweep { surfaces.padding(.top, 18) }

            VStack(spacing: 10) {
                Button { queue.dismiss() } label: {
                    HStack(spacing: 7) {
                        Text(a.primary).font(.system(size: 15, weight: .bold))
                        Text("⏎").font(.system(size: 11, weight: .semibold)).opacity(0.55)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(a.tone, in: RoundedRectangle(cornerRadius: 13))
                    .foregroundStyle(T.hex(0x17150F))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)

                if let secondary = a.secondary {
                    Button { queue.dismiss() } label: {
                        Text(secondary)
                            .font(.system(size: 13, weight: .medium))
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .foregroundStyle(T.faint)
                            .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(T.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 26)

            if let note = queue.queuedNote {
                // Words, not a digit badge. You should know something follows
                // without a count staring at you.
                Text(note)
                    .font(.system(size: 11.5)).foregroundStyle(T.faint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(T.sunken, in: Capsule())
                    .padding(.top, 14)
            }
        }
        .padding(.horizontal, 30).padding(.top, 32).padding(.bottom, 26)
        .frame(width: a == .transition ? 440 : 400)
        .background(T.card, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(a.tone.opacity(0.4), lineWidth: 1))
        .shadow(color: .black.opacity(0.35), radius: 40, y: 14)
    }

    private var handover: some View {
        HStack(spacing: 0) {
            hand("Closing", Sample.companies[0].name, Sample.companies[0].color).opacity(0.45)
            Image(systemName: "arrow.right").font(.system(size: 13)).foregroundStyle(T.faint).padding(.horizontal, 4)
            hand("Starting", Sample.companies[1].name, Sample.companies[1].color)
        }
        .background(T.sunken, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(T.line, lineWidth: 1))
    }

    private func hand(_ cap: String, _ name: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Cap(cap)
            HStack(spacing: 7) { Dot(color: color); Text(name).font(.system(size: 14.5, weight: .semibold)) }
                .foregroundStyle(T.text)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 13).padding(.horizontal, 10)
    }

    private var parkField: some View {
        // Enter makes a newline here. The web version bound Enter to submit, so
        // "one per line" was impossible past line one.
        TextEditor(text: $parked)
            .font(.system(size: 14))
            .scrollContentBackground(.hidden)
            .padding(8)
            .frame(height: 76)
            .background(T.sunken, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(T.lineFirm, lineWidth: 1))
    }

    private var surfaces: some View {
        HStack(spacing: 7) {
            ForEach(["Slack", "Teams", "Messages"], id: \.self) { s in
                HStack(spacing: 7) {
                    Circle().fill(T.amber).frame(width: 6, height: 6)
                    Text(s).font(.system(size: 12.5))
                }
                .foregroundStyle(T.dim)
                .padding(.horizontal, 13).padding(.vertical, 8)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 9))
            }
        }
    }
}

/// The running stand-up timer, top right of the content area.
struct TimerPill: View {
    @ObservedObject var queue: AlertQueue
    @State private var now = Date()
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if let ends = queue.timerEnds {
                let left = max(0, ends.timeIntervalSince(now))
                // Amber, not the card's own neutral. Something is running and
                // you are meant to be on your feet — it should catch the corner
                // of your eye from across the desk, not sit into the chrome.
                HStack(spacing: 11) {
                    Circle()
                        .trim(from: 0, to: left / (15 * 60))
                        .stroke(T.amber, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 20, height: 20)
                        .background(Circle().strokeBorder(T.amber.opacity(0.25), lineWidth: 3))
                    Text(queue.timerLabel)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(T.amber.opacity(0.9))
                    Text(format(left))
                        .font(.system(size: 15, weight: .bold).monospacedDigit())
                        .foregroundStyle(T.amber)
                    Button("Done") { queue.finishTimer() }
                        .buttonStyle(.plain)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(T.hex(0x17150F))
                        .padding(.horizontal, 11).padding(.vertical, 5)
                        .background(T.amber, in: Capsule())
                }
                .padding(.leading, 13).padding(.trailing, 8).padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(T.card)
                        .overlay(Capsule().fill(T.amber.opacity(0.18)))
                )
                .overlay(Capsule().strokeBorder(T.amber.opacity(0.55), lineWidth: 1))
                .shadow(color: T.amber.opacity(0.18), radius: 20, y: 6)
                .shadow(color: .black.opacity(0.35), radius: 18, y: 6)
                .onReceive(tick) { t in
                    now = t
                    if ends.timeIntervalSince(t) <= 0 { queue.finishTimer() }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(T.ease, value: queue.timerEnds)
    }

    private func format(_ s: TimeInterval) -> String {
        String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }
}
