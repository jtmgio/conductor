// Keeps today's reminders fresh and decides when the reminder alert is up.
//
// Runs only where ~/.conductor/reminders exists (the MacBook). Fetch every 60s — a failed
// fetch keeps the last good list; tick every 10s, and every second while a stand-up
// timer is running. A meeting alert always wins the screen.

import AppKit

@MainActor
final class ReminderWatcher {
    private let cfg: Config
    private unowned let meeting: MeetingWatcher
    private var schedule = ReminderSchedule()
    private lazy var overlay = ReminderOverlay()
    private lazy var timer = ReminderTimerPanel()
    private var fetchTimer: Timer?
    private var tickTimer: Timer?
    private var secondTimer: Timer?

    nonisolated init(cfg: Config, meeting: MeetingWatcher) {
        self.cfg = cfg
        self.meeting = meeting
    }

    func start() {
        meeting.onAlertChange = { [weak self] in self?.tick() }
        Task { await refresh() }
        fetchTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        tickTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func refresh() async {
        guard let resp = try? await API.reminders(cfg) else { return }
        schedule.replace(resp.reminders, day: MeetingWatcher.localDay())
        // An ack that failed earlier (offline) goes out now; it stayed hidden meanwhile.
        for id in schedule.unsyncedAcks() { sendAck(id) }
        tick()
    }

    private func tick() {
        let now = Date()
        schedule.rollover(to: MeetingWatcher.localDay())

        for r in schedule.finished(now: now) {
            sendAck(r.id)
            NSSound(named: "Glass")?.play()
            timer.showDone(r)
        }
        if let (r, endsAt) = schedule.running(now: now) {
            timer.showCountdown(r, endsAt: endsAt)
            timer.tick(now: now)
        } else if timer.isRunning {
            // The timer's reminder is gone (new day, or turned off in Settings): don't
            // leave a frozen countdown and a 1s timer behind.
            timer.close()
        }
        updateSecondTimer()

        guard !meeting.isShowing, let due = schedule.due(now: now) else {
            overlay.hide()
            return
        }
        if overlay.shownId == due.id { return }
        if !schedule.hasChimed(due.id) {
            schedule.markChimed(due.id)
            NSSound(named: "Glass")?.play()
        }
        overlay.show(
            due,
            onPrimary: { [weak self] in self?.primary(due) },
            onSecondary: { [weak self] in
                due.isCritical ? self?.snooze(due.id) : self?.ack(due.id)
            },
            onEscape: { [weak self] in self?.snooze(due.id) }
        )
    }

    /// Start a timer, or mark it done (Taken / Done).
    private func primary(_ r: Reminder) {
        if r.isTimed {
            schedule.start(r.id, now: Date())
            overlay.hide()
            tick()
        } else {
            ack(r.id)
        }
    }

    private func ack(_ id: String) {
        schedule.ack(id)
        sendAck(id)
        overlay.hide()
        tick()  // anything still due shows next
    }

    private func snooze(_ id: String) {
        schedule.snooze(id, now: Date())
        schedule.unmarkChimed(id)  // back from a snooze is a new alert
        overlay.hide()
        tick()
    }

    private func sendAck(_ id: String) {
        let cfg = self.cfg
        Task { try? await API.ackReminder(cfg, id: id) }
    }

    /// A 1s tick only while a countdown is on screen, so m:ss moves without a constant timer.
    private func updateSecondTimer() {
        if timer.isRunning, secondTimer == nil {
            secondTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } else if !timer.isRunning, let t = secondTimer {
            t.invalidate()
            secondTimer = nil
        }
    }
}
