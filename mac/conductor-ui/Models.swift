import SwiftUI

// Sample data only. This app has no database, no API and no network — it exists
// to show the UI. Everything below is a stand-in shaped like the real thing.

struct Company: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let title: String
    let prefix: String
    let color: Color
}

struct Job: Identifiable, Hashable {
    let id = UUID()
    let key: String
    let title: String
    var due: String? = nil
    var overdue: Bool = false
    var urgent: Bool = false
    var inProgress: Bool = false
    var note: String? = nil
}

struct Sitting: Identifiable, Hashable {         // a meeting
    let id = UUID()
    let start: String
    let end: String
    let title: String
    let company: String
    let color: Color
    var people: Int? = nil
    var clash: String? = nil
    var live: Bool = false
}

enum Sample {
    static let companies: [Company] = [
        .init(name: "vQuip",               title: "CTO",                   prefix: "VQ",  color: T.hex(0x2DD4B0)),
        .init(name: "Zeta Global",         title: "UI Director",           prefix: "ZG",  color: T.hex(0x4E8FD6)),
        .init(name: "Healthmap Solutions", title: "UI Architect",          prefix: "HS",  color: T.hex(0xD6455E)),
        .init(name: "HealthMe",            title: "Senior Engineer",       prefix: "HM",  color: T.hex(0x7C6BD6)),
        .init(name: "Wris",                title: "Engineering Contractor",prefix: "WRI", color: T.hex(0x5BAE6E)),
        .init(name: "Xenegrade",           title: "Senior Engineer",       prefix: "XEN", color: T.hex(0xD6A23F)),
        .init(name: "TrainBetter.coach",   title: "Owner",                 prefix: "TB",  color: T.hex(0x3FA8B8)),
        .init(name: "React Health",        title: "Senior Engineer",       prefix: "RH",  color: T.hex(0xD6603F)),
        .init(name: "Conductor",           title: "Maintainer",            prefix: "CND", color: T.hex(0x5B7FD6)),
        .init(name: "Personal",            title: "Self",                  prefix: "PER", color: T.hex(0xC4506B)),
    ]

    static let oneThing = Job(key: "VQ-163", title: "Finalize Ops Engine planning",
                              due: "Monday", inProgress: true)

    static let upNext: [Job] = [
        .init(key: "VQ-177", title: "Schedule Deepesh transition sync",              due: "Due yesterday", overdue: true, urgent: true),
        .init(key: "VQ-169", title: "Run Deepesh cross-team sync and document access", due: "Aug 18", overdue: true, urgent: true),
        .init(key: "VQ-175", title: "Build Deepesh migration tracking plan",          due: "Tomorrow", urgent: true),
        .init(key: "VQ-168", title: "Execute Deepesh knowledge transfer and access rotation", due: "Sep 17", urgent: true),
        .init(key: "VQ-165", title: "Determine UXCam recording strategy",             due: "Aug 18", overdue: true),
        .init(key: "VQ-164", title: "Analyze UXCam last-login data for usage confirmation", due: "Aug 18", overdue: true),
        .init(key: "VQ-171", title: "Review Miro mockups for full comprehension",     due: "Aug 19", overdue: true),
        .init(key: "VQ-172", title: "Set up testing environment for Ops Engine",      due: "Aug 19", overdue: true),
        .init(key: "VQ-173", title: "Complete Phase 1 and test items",                due: "Aug 19", overdue: true),
        .init(key: "VQ-162", title: "Design IT access channel into Linear",           due: "Aug 18", overdue: true),
        .init(key: "VQ-151", title: "Review UXCam usage, pricing, and access",        due: "Aug 17", overdue: true),
    ]

    static let inProgress: [Job] = [
        .init(key: "VQ-163", title: "Finalize Ops Engine planning", due: "Aug 18", overdue: true, inProgress: true),
        .init(key: "VQ-150", title: "Design call on PROG-* memo authority", inProgress: true, note: "Waiting on Luke"),
    ]

    static let backlog: [Job] = upNext

    static let meetings: [Sitting] = [
        .init(start: "10:30", end: "11:00", title: "API Team Daily",              company: "vQuip",               color: T.hex(0x2DD4B0), live: true),
        .init(start: "12:00", end: "12:30", title: "Code Review",                 company: "vQuip",               color: T.hex(0x2DD4B0)),
        .init(start: "12:00", end: "12:30", title: "Workflow Standup",            company: "Healthmap Solutions", color: T.hex(0xD6455E), people: 11, clash: "Clashes with Code Review"),
        .init(start: "1:00",  end: "1:15",  title: "Josh / Diego — quick what's up", company: "HealthMe",         color: T.hex(0x7C6BD6), people: 2),
        .init(start: "2:00",  end: "2:45",  title: "HealthMe Weekly Recap",       company: "HealthMe",            color: T.hex(0x7C6BD6), people: 17, clash: "Clashes with Josh / Jeff"),
        .init(start: "2:00",  end: "2:30",  title: "Josh / Jeff",                 company: "vQuip",               color: T.hex(0x2DD4B0), people: 2),
    ]

    static let draft = """
    hey so the report_configs_v2 fixes are done and committed but they are NOT in \
    prod yet. when they land the delivery counts on lead_delivery_summary basically \
    double on any LP with wide offer fan-out, and paused attachments start showing a \
    Paused count. i dont want this landing unannounced, need ranjith to say when
    """
}

/// Which screen the sidebar is showing.
enum Screen: String, CaseIterable, Identifiable {
    case today, board, tracker, formatter, meetings, settings
    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Today"
        case .board: return "Board"
        case .tracker: return "Tracker"
        case .formatter: return "Formatter"
        case .meetings: return "Meetings"
        case .settings: return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .today: return "scope"
        case .board: return "rectangle.split.3x1"
        case .tracker: return "checklist"
        case .formatter: return "paperplane"
        case .meetings: return "calendar"
        case .settings: return "gearshape"
        }
    }

    var shortcut: KeyEquivalent {
        switch self {
        case .today: return "1"
        case .board: return "2"
        case .tracker: return "3"
        case .formatter: return "4"
        case .meetings: return "5"
        case .settings: return ","
        }
    }
}
