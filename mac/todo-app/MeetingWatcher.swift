// Keeps today's meetings fresh and decides when the full-screen alert is up.
//
// Fetch every 60s (a failed fetch keeps the last good list, so alerts still fire off
// Tailscale); check the clock every 10s so a 2-minute warning is actually ~2 minutes.

import AppKit

@MainActor
final class MeetingWatcher {
    private let cfg: Config
    private(set) var schedule = MeetingSchedule()
    private lazy var overlay = MeetingOverlay()
    private var fetchTimer: Timer?
    private var tickTimer: Timer?
    private var shownId: String?

    /// nonisolated so AppDelegate can hold one as a stored property; all work happens on main.
    nonisolated init(cfg: Config) {
        self.cfg = cfg
    }

    func start() {
        Task { await refresh() }
        fetchTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        tickTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func refresh() async {
        guard let resp = try? await API.meetings(cfg) else { return }
        schedule.replace(resp.meetings, day: Self.localDay())
        tick()
    }

    private func tick() {
        let now = Date()
        schedule.rollover(to: Self.localDay())
        guard let due = schedule.due(now: now) else {
            if shownId != nil { hide() }
            return
        }
        if due.id != shownId {
            shownId = due.id
            overlay.show(
                meeting: due,
                now: now,
                onSnooze: { [weak self] in self?.snooze(due.id) },
                onDismiss: { [weak self] in self?.dismiss(due.id) }
            )
        } else {
            overlay.update(now: now)
        }
    }

    /// Hand keyboard focus back to the alert, if one is up (after the ⌃⌥M panel closes).
    func refocusAlert() {
        overlay.refocus()
    }

    private func snooze(_ id: String) {
        schedule.snooze(id, now: Date())
        hide()
        tick()
    }

    private func dismiss(_ id: String) {
        schedule.dismiss(id)
        hide()
        tick()  // a second meeting due at the same time shows next
    }

    private func hide() {
        shownId = nil
        overlay.hide()
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    static func localDay() -> String { dayFormatter.string(from: Date()) }
}
