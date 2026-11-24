// MeetingSchedule checks. Run: bash mac/todo-app/tests/run.sh
// A plain executable (no XCTest) so it builds with the command line tools alone.

import Foundation

var failures = 0
func check(_ cond: Bool, _ name: String) {
    if cond { print("ok   \(name)") } else { print("FAIL \(name)"); failures += 1 }
}

let t0 = Date(timeIntervalSince1970: 1_795_100_000)
let day = "2026-11-19"
func meeting(_ id: String, _ start: Date) -> Meeting {
    Meeting(id: id, title: id, startsAt: start, endsAt: start.addingTimeInterval(1800),
            startTime: "10:00", endTime: "10:30", joinUrl: nil, company: MeetingCompany(name: "vQuip", color: "#2dd4bf"))
}
let A = meeting("A", t0)
let B = meeting("B", t0.addingTimeInterval(30))
func fresh() -> MeetingSchedule {
    var s = MeetingSchedule()
    s.replace([A, B], day: day)
    return s
}

do {
    let s = fresh()
    check(s.due(now: t0 - 121) == nil, "notDueEarly")
    check(s.due(now: t0 - 120)?.id == "A", "dueAtLead")
    check(s.due(now: t0 + 60)?.id == "A", "wakeInsideGraceAlerts")
    check(s.due(now: t0 + 151) == nil, "wakeAfterGraceSilent")
}
do {
    var s = fresh()
    check(s.due(now: t0)?.id == "A", "earliestDueWins")
    s.dismiss("A")
    check(s.due(now: t0)?.id == "B", "earliestDueWins after dismiss")
}
do {
    var s = fresh()
    s.snooze("A", now: t0)
    check(s.due(now: t0 + 30)?.id != "A", "snoozeHides")
}
do {
    var s = fresh()
    s.snooze("A", now: t0 + 110)
    s.dismiss("B")
    check(s.due(now: t0 + 170)?.id == "A", "snoozeAlwaysReturns")
}
do {
    var s = fresh()
    s.snooze("A", now: t0 + 60)
    s.dismiss("B")
    check(s.due(now: t0 + 120)?.id == "A", "snoozeExpires returns")
    check(s.due(now: t0 + 120 + 121) == nil, "snoozeExpires closes after grace")
}
do {
    var s = fresh()
    check(s.alsoDue(now: t0).map(\.id) == ["B"], "alsoDue lists the other due meeting")
    s.dismiss("B")
    check(s.alsoDue(now: t0).isEmpty, "alsoDue skips dismissed")
    let s2 = fresh()
    check(s2.alsoDue(now: t0 - 121).isEmpty, "alsoDue empty when nothing due")
}
do {
    var s = MeetingSchedule()
    check(!s.loaded, "loaded false before any fetch")
    s.replace([], day: day)
    check(s.loaded, "loaded true after an empty fetch")
    s.rollover(to: "2026-11-20")
    check(!s.loaded, "loaded false after rollover")
}
do {
    var s = fresh()
    s.dismiss("A")
    check(s.due(now: t0 - 60)?.id != "A" && s.due(now: t0 + 60)?.id != "A", "dismissIsFinal")
}
do {
    var s = fresh()
    s.replace([B], day: day)
    check(s.due(now: t0)?.id == "B", "vanishedMeetingNotDue")
}
do {
    var s = fresh()
    s.dismiss("A")
    s.rollover(to: "2026-11-20")
    check(s.meetings.isEmpty, "rolloverClearsState")
    s.replace([A], day: "2026-11-20")
    check(s.due(now: t0)?.id == "A", "rolloverClearsState dismissals")
}
do {
    var s = fresh()
    s.dismiss("A")
    s.replace([A, B], day: day)
    check(s.due(now: t0)?.id == "B", "refetchKeepsDismissals")
}
do {
    check(MeetingSchedule.countdown(A, now: t0 - 120) == "2 min", "countdown 2 min")
    check(MeetingSchedule.countdown(A, now: t0 - 61) == "2 min", "countdown rounds up")
    check(MeetingSchedule.countdown(A, now: t0 - 60) == "1 min", "countdown 1 min")
    check(MeetingSchedule.countdown(A, now: t0) == "Starting now", "countdown now")
    check(MeetingSchedule.countdown(A, now: t0 + 60) == "Starting now", "countdown late")
}
do {
    let s = fresh()
    let up = s.upcoming(now: t0 + 1801)
    check(up.map(\.id) == ["B"], "upcomingDropsEnded")
}
do {
    let json = """
    {"date":"2026-11-19","meetings":[{"id":"m1","title":"Sprint Planning",
     "startsAt":"2026-11-19T15:00:00.000Z","endsAt":"2026-11-19T15:30:00.000Z",
     "startTime":"10:00","endTime":"10:30","company":{"name":"vQuip","color":"#2dd4bf"}}]}
    """
    let r = try? MeetingsResponse.decoder.decode(MeetingsResponse.self, from: Data(json.utf8))
    check(r?.meetings.first?.startsAt == Date(timeIntervalSince1970: 1_795_100_400), "decodesServerJSON")
    check(r?.meetings.first?.joinURL == nil, "noJoinUrlIsNil")
}
do {
    let json = """
    {"date":"2026-11-19","meetings":[{"id":"m1","title":"Sync","joinUrl":"https://meet.google.com/abc-defg-hij",
     "startsAt":"2026-11-19T15:00:00.000Z","endsAt":"2026-11-19T15:30:00.000Z",
     "startTime":"10:00","endTime":"10:30","company":{"name":"vQuip","color":"#2dd4bf"}},
     {"id":"m2","title":"Bad","joinUrl":"javascript:alert(1)",
     "startsAt":"2026-11-19T15:00:00.000Z","endsAt":"2026-11-19T15:30:00.000Z",
     "startTime":"10:00","endTime":"10:30","company":{"name":"vQuip","color":"#2dd4bf"}}]}
    """
    let r = try? MeetingsResponse.decoder.decode(MeetingsResponse.self, from: Data(json.utf8))
    check(r?.meetings.first?.joinURL?.absoluteString == "https://meet.google.com/abc-defg-hij", "decodesJoinUrl")
    check(r?.meetings.last?.joinURL == nil, "refusesNonHttpsJoinUrl")
}

// MARK: - ReminderSchedule

let r0 = Date(timeIntervalSince1970: 1_795_200_000)
let rday = "2026-11-24"
func rem(_ id: String, _ due: Date, icon: String? = "pill", tier: String = "normal",
         mins: Int? = nil, acked: Bool = false) -> Reminder {
    Reminder(id: id, label: id, icon: icon, tier: tier, durationMin: mins, dueAt: due, ackedToday: acked)
}
func rs(_ list: [Reminder]) -> ReminderSchedule {
    var s = ReminderSchedule()
    s.replace(list, day: rday)
    return s
}

do {
    let s = rs([rem("V", r0)])
    check(s.due(now: r0 - 1) == nil, "notDueBeforeTime")
    check(s.due(now: r0)?.id == "V", "dueAtTime")
    check(s.due(now: r0 + 6 * 3600)?.id == "V", "staysDueAllDay")
}
do {
    let s = rs([rem("vit", r0), rem("shake", r0 + 5 * 3600)])
    check(s.due(now: r0 + 5 * 3600 + 60)?.id == "shake", "latestDueFirst")
}
do {
    var s = rs([rem("vit", r0), rem("shake", r0 + 60)])
    s.ack("shake")
    check(s.due(now: r0 + 120)?.id == "vit", "localAckHides")
}
do {
    let s = rs([rem("V", r0, acked: true)])
    check(s.due(now: r0) == nil, "serverAckHides")
}
do {
    var s = rs([rem("V", r0)])
    s.snooze("V", now: r0)
    check(s.due(now: r0 + 299) == nil, "snoozeHidesFiveMinutes")
    check(s.due(now: r0 + 300)?.id == "V", "snoozeReturnsAtFive")
}
do {
    var s = rs([rem("S", r0, icon: "stretch", mins: 15)])
    s.start("S", now: r0)
    check(s.due(now: r0 + 60) == nil, "startHidesWhileRunning")
    check(s.running(now: r0 + 60)?.1 == r0 + 900, "runningEndsAfterDuration")
    var s2 = s
    check(s2.finished(now: r0 + 899).isEmpty, "notFinishedEarly")
    let done = s2.finished(now: r0 + 900)
    check(done.map(\.id) == ["S"], "finishedReturnsIt")
    check(s2.finished(now: r0 + 901).isEmpty, "finishedOnlyOnce")
    check(s2.due(now: r0 + 901) == nil && s2.running(now: r0 + 901) == nil, "finishedIsAcked")
}
do {
    var s = rs([rem("V", r0)])
    s.ack("V")
    check(s.unsyncedAcks() == ["V"], "unsyncedAckListed")
    s.replace([rem("V", r0, acked: true)], day: rday)
    check(s.unsyncedAcks().isEmpty, "unsyncedAckClearsWhenServerHasIt")
}
do {
    var s = rs([rem("V", r0), rem("W", r0, mins: 15)])
    s.snooze("V", now: r0)
    s.start("W", now: r0)
    s.rollover(to: "2026-11-25")
    check(s.due(now: r0 + 10) == nil && s.running(now: r0 + 10) == nil, "rolloverDropsList")
    s.replace([rem("V", r0 + 86400), rem("W", r0 + 86400, mins: 15)], day: "2026-11-25")
    check(s.due(now: r0 + 86400)?.id != nil && s.running(now: r0 + 86400) == nil, "rolloverClearsState")
}
do {
    check(rem("a", r0, icon: "pill").primaryLabel == "Taken", "pillSaysTaken")
    check(rem("a", r0, icon: "syringe").primaryLabel == "Taken", "syringeSaysTaken")
    check(rem("a", r0, icon: "stretch", mins: 15).primaryLabel == "Start", "timedSaysStart")
    check(rem("a", r0, icon: "mail").primaryLabel == "Done", "otherSaysDone")
    check(rem("a", r0, tier: "critical").isCritical, "criticalFlag")
}
do {
    let json = """
    {"date":"2026-11-24","reminders":[{"id":"r1","label":"Take vitamins","icon":"pill","tier":"critical",
     "durationMin":null,"dueAt":"2026-11-24T14:45:00.000Z","ackedToday":false}]}
    """
    let r = try? MeetingsResponse.decoder.decode(RemindersResponse.self, from: Data(json.utf8))
    check(r?.reminders.first?.dueAt == ISO8601DateFormatter().date(from: "2026-11-24T14:45:00Z"), "decodesRemindersJSON")
}

print(failures == 0 ? "all passed" : "\(failures) failed")
exit(failures == 0 ? 0 : 1)
