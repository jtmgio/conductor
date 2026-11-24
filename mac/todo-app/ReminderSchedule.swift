// Reminder alert rules — pure logic, no AppKit, so tests/run.sh can exercise it alone.
//
// Copies the browser's rules (src/components/Reminders.tsx): a reminder is due from its
// time until acked, for the rest of the day; latest due time shows first; snooze is
// 5 minutes; a timed reminder runs its countdown and is acked when it hits zero.
// Design: docs/superpowers/specs/2026-11-24-mac-reminder-alert-design.md

import Foundation

struct Reminder: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let icon: String?
    let tier: String
    let durationMin: Int?
    let dueAt: Date
    let ackedToday: Bool

    var isCritical: Bool { tier == "critical" }
    var isTimed: Bool { (durationMin ?? 0) > 0 }

    /// The main button: Start for a timer, Taken for a pill or shot, Done otherwise.
    var primaryLabel: String {
        if isTimed { return "Start" }
        return icon == "pill" || icon == "syringe" ? "Taken" : "Done"
    }
}

struct RemindersResponse: Decodable {
    let date: String
    let reminders: [Reminder]
}

struct ReminderSchedule {
    static let snooze: TimeInterval = 300

    private(set) var day: String = ""
    private(set) var reminders: [Reminder] = []
    private var acked: Set<String> = []
    private var snoozedUntil: [String: Date] = [:]
    private var runningUntil: [String: Date] = [:]

    /// A fetch landed. Same day keeps local acks, snoozes and timers; a new day starts clean.
    mutating func replace(_ reminders: [Reminder], day: String) {
        if day != self.day { clear() }
        self.day = day
        self.reminders = reminders
    }

    /// The local day changed. Drops yesterday's list even when no fetch has succeeded.
    mutating func rollover(to day: String) {
        guard day != self.day else { return }
        clear()
        self.day = day
    }

    mutating func ack(_ id: String) {
        acked.insert(id)
        snoozedUntil[id] = nil
        runningUntil[id] = nil
    }

    mutating func snooze(_ id: String, now: Date) {
        snoozedUntil[id] = now.addingTimeInterval(Self.snooze)
    }

    mutating func start(_ id: String, now: Date) {
        guard let r = reminders.first(where: { $0.id == id }), let mins = r.durationMin else { return }
        snoozedUntil[id] = nil
        runningUntil[id] = now.addingTimeInterval(TimeInterval(mins * 60))
    }

    /// The reminder that should hold the screen now: the latest one due.
    func due(now: Date) -> Reminder? {
        reminders
            .filter { isDue($0, now: now) }
            .max { $0.dueAt < $1.dueAt }
    }

    /// The countdown to show, and when it ends.
    func running(now: Date) -> (Reminder, Date)? {
        reminders.lazy
            .compactMap { r in self.runningUntil[r.id].map { (r, $0) } }
            .first { $0.1 > now }
    }

    /// Timers that hit zero. Each is returned once and counts as acked from then on.
    mutating func finished(now: Date) -> [Reminder] {
        let done = reminders.filter { r in runningUntil[r.id].map { $0 <= now } ?? false }
        done.forEach { ack($0.id) }
        return done
    }

    /// Acked here but the last fetch still says not acked — the server call failed or
    /// hasn't landed. The watcher re-sends these.
    func unsyncedAcks() -> [String] {
        reminders.filter { acked.contains($0.id) && !$0.ackedToday }.map(\.id)
    }

    private func isDue(_ r: Reminder, now: Date) -> Bool {
        if r.ackedToday || acked.contains(r.id) || runningUntil[r.id] != nil { return false }
        if let until = snoozedUntil[r.id], now < until { return false }
        return now >= r.dueAt
    }

    private mutating func clear() {
        reminders = []
        acked = []
        snoozedUntil = [:]
        runningUntil = [:]
    }
}
