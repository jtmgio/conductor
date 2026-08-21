import SwiftUI

/// One company, one thing, everything else folded away.
struct TodayView: View {
    @State private var showNext = false
    @State private var showBacklog = false
    @State private var showOthers = false
    @State private var swept = true

    private let company = Sample.companies[0]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            sweepStrip.padding(.top, 18)

            HStack(alignment: .top, spacing: 22) {
                mainColumn
                agenda.frame(width: 320)
            }
            .padding(.top, 20)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 30)
        .padding(.top, 44)
        .padding(.bottom, 26)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                HStack(spacing: 11) {
                    Dot(color: company.color, size: 9)
                    Text(company.name)
                        .font(.system(size: T.s(30), weight: .semibold))
                        .foregroundStyle(T.text)
                }
                Text("\(company.title) · 19 min in, 101 left")
                    .font(.system(size: T.s(14)).monospacedDigit())
                    .foregroundStyle(T.dim)
                Spacer()
                Button {} label: {
                    Label("Plan tomorrow", systemImage: "arrow.counterclockwise")
                        .font(.system(size: T.s(13)))
                }
                .buttonStyle(GhostButton())
            }

            // Block progress, full width. It was a hairline of small grey text.
            ProgressBar(fraction: 0.16, tint: company.color, height: 4).padding(.top, 16)
            HStack {
                Text("7:00")
                Spacer()
                Cap("Morning block")
                Spacer()
                Text("9:00")
            }
            .font(.system(size: T.s(11.5)).monospacedDigit())
            .foregroundStyle(T.faint)
            .padding(.top, 6)
        }
    }

    private var sweepStrip: some View {
        HStack(spacing: 9) {
            Image(systemName: swept ? "checkmark" : "clock")
                .font(.system(size: T.s(12), weight: .bold))
            Text(swept ? "Comms covered" : "Sweep due").font(.system(size: T.s(13), weight: .medium))
            Text(swept ? "· next sweep in 18 min" : "· Slack, Teams, messages")
                .font(.system(size: T.s(13)))
                .foregroundStyle(T.faint)
            Spacer()
            if !swept {
                Button("Swept") { withAnimation(T.quick) { swept = true } }
                    .buttonStyle(.plain)
                    .font(.system(size: T.s(12.5), weight: .medium))
            }
        }
        .foregroundStyle(swept ? T.go : T.amber)
        .padding(.horizontal, 13).padding(.vertical, 9)
        .background(swept ? T.goWash : T.amberWash, in: RoundedRectangle(cornerRadius: 9))
    }

    private var mainColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            oneThing

            // Everything else starts closed. One thing on screen is the point.
            HStack(spacing: 6) {
                Disclosure(label: "More for vQuip", open: $showNext)
                Disclosure(label: "Pull from vQuip backlog", open: $showBacklog)
                Disclosure(label: "Other companies", open: $showOthers)
            }

            if showNext {
                VStack(spacing: 0) {
                    ForEach(Sample.upNext) { JobRow(job: $0) }
                }
                .padding(.horizontal, 16).padding(.vertical, 6)
                .cardSurface()
            }

            if showOthers {
                VStack(spacing: 0) {
                    ForEach(Sample.companies.dropFirst().prefix(4)) { c in
                        HStack(spacing: 9) {
                            Dot(color: c.color)
                            Text(c.name).font(.system(size: T.s(13.5))).foregroundStyle(T.text)
                            Spacer()
                            Text("Urgent").font(.system(size: T.s(11.5))).foregroundStyle(T.alarm)
                        }
                        .padding(.vertical, 9)
                        Divider().overlay(T.line)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 6)
                .cardSurface()
            }

            capture
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var oneThing: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Cap("Your one thing", color: company.color)
                HStack(alignment: .top, spacing: 14) {
                    Circle().strokeBorder(T.lineFirm, lineWidth: 2).frame(width: 24, height: 24)
                    VStack(alignment: .leading, spacing: 11) {
                        Text(Sample.oneThing.title)
                            .font(.system(size: T.s(22), weight: .semibold))
                            .foregroundStyle(T.text)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 7) {
                            Pill(text: "In progress", fg: T.go, bg: T.goWash)
                            KeyChip(key: Sample.oneThing.key)
                            Pill(text: "Monday")
                            Pill(text: "Blocked?")
                        }
                    }
                }
                .padding(.top, 11)
            }
            .padding(20)
            Spacer(minLength: 0)
        }
        .background(T.card)
        .clipShape(RoundedRectangle(cornerRadius: T.radius))
        .overlay(alignment: .leading) { Rectangle().fill(company.color).frame(width: 3) }
        .clipShape(RoundedRectangle(cornerRadius: T.radius))
        .overlay(RoundedRectangle(cornerRadius: T.radius).strokeBorder(T.line, lineWidth: 1))
        .fixedSize(horizontal: false, vertical: true)
    }

    private var capture: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus").font(.system(size: T.s(13), weight: .medium))
            Text("Capture a thought for vQuip…").font(.system(size: T.s(14)))
            Spacer()
        }
        .foregroundStyle(T.faint)
        .padding(.horizontal, 16).padding(.vertical, 13)
        .background(T.sunken, in: RoundedRectangle(cornerRadius: 11))
        .overlay(
            RoundedRectangle(cornerRadius: 11)
                .strokeBorder(T.lineFirm, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        )
    }

    private var agenda: some View {
        VStack(alignment: .leading, spacing: 0) {
            Cap("Today").padding(.bottom, 11)
            ForEach(Sample.meetings) { m in
                MeetingRow(sitting: m, compact: true)
                if m.id != Sample.meetings.last?.id { Divider().overlay(T.line) }
            }
        }
        .padding(.horizontal, 17).padding(.vertical, 15)
        .cardSurface()
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct Disclosure: View {
    let label: String
    @Binding var open: Bool
    @State private var hovering = false

    var body: some View {
        Button { withAnimation(T.quick) { open.toggle() } } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: T.s(10), weight: .semibold))
                    .rotationEffect(.degrees(open ? 90 : 0))
                Text(label).font(.system(size: T.s(12.5)))
            }
            .foregroundStyle(open || hovering ? T.text : T.faint)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 7).fill(hovering ? T.cardHover : .clear))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

struct JobRow: View {
    let job: Job
    @State private var hovering = false

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            RoundedRectangle(cornerRadius: 5)
                .strokeBorder(T.lineFirm, lineWidth: 1.5)
                .frame(width: 16, height: 16)
            Text(job.title).font(.system(size: T.s(14))).foregroundStyle(T.text)
            Spacer(minLength: 12)
            HStack(spacing: 8) {
                Text(job.key).font(.system(size: T.s(11.5), design: .monospaced)).foregroundStyle(T.dim)
                if let due = job.due ?? job.note {
                    Text(due)
                        .font(.system(size: T.s(11.5)))
                        .foregroundStyle(job.overdue ? T.alarm : T.faint)
                }
            }
        }
        .padding(.vertical, 9).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 7).fill(hovering ? T.cardHover : .clear))
        .onHover { hovering = $0 }
    }
}

struct GhostButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(T.dim)
            .padding(.horizontal, 13).padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(configuration.isPressed ? T.cardHover : .clear)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(T.lineFirm, lineWidth: 1))
            )
    }
}
