// Meeting alert timing — pure logic, no AppKit, so tests/run.sh can exercise it alone.
//
// The server sends absolute instants (startsAt/endsAt); this decides which meeting, if
// any, should be on screen right now. Fixed rules from the design doc: alert 2 min before
// start, stop 2 min after, snooze 1 min (a snooze always comes back once, even past the
// window), dismiss is final for the day.

import Foundation

struct MeetingCompany: Decodable, Hashable {
    let name: String
    let color: String
}

struct Meeting: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let startsAt: Date
    let endsAt: Date
    let startTime: String
    let endTime: String
    let company: MeetingCompany
}

struct MeetingsResponse: Decodable {
    let date: String
    let meetings: [Meeting]

    /// The server's toISOString() always carries milliseconds; plain .iso8601 rejects them.
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            guard let date = f.date(from: s) else {
                throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "bad date \(s)"))
            }
            return date
        }
        return d
    }()
}

struct MeetingSchedule {
    static let lead: TimeInterval = 120
    static let grace: TimeInterval = 120
    static let snooze: TimeInterval = 60

    private(set) var day: String = ""
    private(set) var meetings: [Meeting] = []
    /// A fetch has landed for `day`. False means "never reached Conductor today" — the panel
    /// must say so rather than claim there are no meetings.
    private(set) var loaded = false
    private var dismissed: Set<String> = []
    private var snoozedUntil: [String: Date] = [:]

    /// A fetch landed. Same day keeps dismissals and snoozes; a new day starts clean.
    mutating func replace(_ meetings: [Meeting], day: String) {
        if day != self.day { clear() }
        self.day = day
        self.meetings = meetings.sorted { $0.startsAt < $1.startsAt }
        loaded = true
    }

    /// The local day changed. Drops yesterday's list even when no fetch has succeeded.
    mutating func rollover(to day: String) {
        guard day != self.day else { return }
        clear()
        self.day = day
    }

    mutating func dismiss(_ id: String) {
        dismissed.insert(id)
        snoozedUntil[id] = nil
    }

    mutating func snooze(_ id: String, now: Date) {
        snoozedUntil[id] = now.addingTimeInterval(Self.snooze)
    }

    /// The earliest meeting that should be on screen now, if any.
    func due(now: Date) -> Meeting? {
        meetings.first { m in
            if dismissed.contains(m.id) { return false }
            // A snooze always brings it back once, then closes like a normal alert would —
            // never a full-screen alert for a meeting that ended while the lid was shut.
            if let until = snoozedUntil[m.id] { return now >= until && now <= until.addingTimeInterval(Self.grace) }
            return now >= m.startsAt.addingTimeInterval(-Self.lead)
                && now <= m.startsAt.addingTimeInterval(Self.grace)
        }
    }

    /// Meetings that haven't ended, earliest first — the ⌃⌥M panel.
    func upcoming(now: Date) -> [Meeting] {
        meetings.filter { $0.endsAt > now }
    }

    /// "2 min" / "1 min" / "Starting now". Rounds up so the alert opens on "2 min".
    static func countdown(_ m: Meeting, now: Date) -> String {
        let secs = m.startsAt.timeIntervalSince(now)
        if secs <= 0 { return "Starting now" }
        let mins = Int((secs / 60).rounded(.up))
        return "\(mins) min"
    }

    private mutating func clear() {
        meetings = []
        loaded = false
        dismissed = []
        snoozedUntil = [:]
    }
}
