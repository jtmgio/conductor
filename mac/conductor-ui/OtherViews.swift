import SwiftUI

// ── Board ────────────────────────────────────────────────────────────────
/// Three lanes at equal thirds. Lanes are sunken surfaces with cards raised on
/// them, so a drop target is visible; a heading over a bare column doesn't read
/// as a board.
struct BoardView: View {
    @State private var company = Sample.companies[0].id

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Board").font(.system(size: T.s(30), weight: .semibold)).foregroundStyle(T.text)
            Text("One company at a time. Drag a card to move it.")
                .font(.system(size: T.s(14))).foregroundStyle(T.dim).padding(.top, 6)

            CompanyPicker(selected: $company).padding(.top, 18)

            HStack(alignment: .top, spacing: 16) {
                Lane(title: "Backlog", jobs: Sample.backlog)
                Lane(title: "In progress", jobs: Sample.inProgress, tint: T.go)
                Lane(title: "Done", jobs: [], tint: T.faint,
                     empty: "Drop a card here to finish it.\nNothing stays — done work leaves the board.",
                     addable: false)
            }
            .padding(.top, 20)
        }
        .padding(.horizontal, 30).padding(.top, 44).padding(.bottom, 26)
    }
}

private struct Lane: View {
    let title: String
    let jobs: [Job]
    var tint: Color = T.faint
    var empty: String? = nil
    /// Done is a drop target, not somewhere you type new work into.
    var addable: Bool = true

    @State private var added: [Job] = []
    @State private var composing = false
    @State private var draft = ""
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Cap(title, color: tint).padding(.horizontal, 4).padding(.bottom, 11)

            if jobs.isEmpty, let empty {
                Text(empty)
                    .font(.system(size: T.s(13)))
                    .foregroundStyle(T.faint)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(24)
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(jobs + added) { Card(job: $0) }
                        if addable { composer }
                    }
                    .padding(.trailing, 3)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 13)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(T.sunken, in: RoundedRectangle(cornerRadius: T.radius))
        .overlay(RoundedRectangle(cornerRadius: T.radius).strokeBorder(T.line, lineWidth: 1))
    }
}

extension Lane {
    /// Capture at the bottom of the lane it belongs to, so filing is the same
    /// gesture as looking.
    @ViewBuilder var composer: some View {
        if composing {
            VStack(alignment: .leading, spacing: 9) {
                TextField("What needs doing?", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: T.s(14)))
                    .foregroundStyle(T.text)
                    .lineLimit(1...3)
                    .focused($focus)
                    .onSubmit { commit() }
                HStack(spacing: 8) {
                    Spacer()
                    Button("Cancel") { cancel() }
                        .buttonStyle(.plain)
                        .font(.system(size: T.s(12)))
                        .foregroundStyle(T.faint)
                    Button("Add") { commit() }
                        .buttonStyle(.plain)
                        .font(.system(size: T.s(12.5), weight: .semibold))
                        .foregroundStyle(T.hex(0x17150F))
                        .padding(.horizontal, 11).padding(.vertical, 5)
                        .background(T.accent, in: RoundedRectangle(cornerRadius: 7))
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 12)
            .background(T.card, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(T.accent.opacity(0.5), lineWidth: 1))
            .onExitCommand { cancel() }
        } else {
            Button { draft = ""; composing = true; focus = true } label: {
                HStack(spacing: 9) {
                    Image(systemName: "plus").font(.system(size: T.s(11), weight: .semibold))
                    Text("Add").font(.system(size: T.s(13)))
                    Spacer()
                }
                .foregroundStyle(T.faint)
                .padding(.horizontal, 13).padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(T.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                )
            }
            .buttonStyle(.plain)
        }
    }

    func commit() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { cancel(); return }
        withAnimation(T.quick) {
            added.append(Job(key: "VQ-new\(added.count + 1)", title: text))
        }
        draft = ""
        focus = true   // adding one usually means adding two
    }

    func cancel() { draft = ""; composing = false; focus = false }
}

private struct Card: View {
    let job: Job
    var company: Company = Sample.companies[0]
    @EnvironmentObject var sheets: Sheets
    @State private var hovering = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if job.urgent { Rectangle().fill(T.alarm).frame(width: 3) }
            else if job.inProgress { Rectangle().fill(T.go).frame(width: 3) }

            VStack(alignment: .leading, spacing: 8) {
                // A stripe survives peripheral vision; an eyebrow alone doesn't.
                if job.urgent { Cap("Urgent", color: T.alarm) }
                Text(job.title)
                    .font(.system(size: T.s(14)))
                    .foregroundStyle(T.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 8) {
                    KeyChip(key: job.key)
                    if let due = job.due ?? job.note {
                        Text(due).font(.system(size: T.s(11.5)))
                            .foregroundStyle(job.overdue ? T.alarm : T.faint)
                    }
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 12)
        }
        .background(hovering ? T.cardHover : T.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(hovering ? T.lineFirm : T.line, lineWidth: 1))
        .onHover { hovering = $0 }
        .onTapGesture { sheets.open(job, in: company) }
    }
}

// ── Meetings ─────────────────────────────────────────────────────────────
struct MeetingsView: View {
    @State private var company: UUID? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Meetings").font(.system(size: T.s(30), weight: .semibold)).foregroundStyle(T.text)
            Text("Everything your calendar synced — prep, notes, and transcripts in one place.")
                .font(.system(size: T.s(14))).foregroundStyle(T.dim).padding(.top, 6)

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").font(.system(size: T.s(12)))
                Text("Search meeting titles…").font(.system(size: T.s(14)))
                Spacer()
            }
            .foregroundStyle(T.faint)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .cardSurface(9)
            .padding(.top, 18)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 10) {
                        Cap("Today · Friday 21 August")
                        Rectangle().fill(T.line).frame(height: 1)
                    }
                    .padding(.top, 22).padding(.bottom, 10)

                    ForEach(Sample.meetings) { m in
                        MeetingRow(sitting: m).padding(.bottom, 7)
                    }
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 30).padding(.top, 44).padding(.bottom, 26)
    }
}

struct MeetingRow: View {
    let sitting: Sitting
    var compact: Bool = false
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(sitting.start).font(.system(size: compact ? 12.5 : 13.5, weight: .semibold).monospacedDigit())
                    .foregroundStyle(T.text)
                Text(sitting.end).font(.system(size: T.s(11.5)).monospacedDigit()).foregroundStyle(T.faint)
            }
            .frame(width: compact ? 50 : 62, alignment: .trailing)

            VStack(alignment: .leading, spacing: 4) {
                Text(sitting.title)
                    .font(.system(size: compact ? 13.5 : 14.5, weight: compact ? .regular : .medium))
                    .foregroundStyle(T.text)
                    .lineLimit(2)
                HStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Dot(color: sitting.color, size: 6)
                        Text(sitting.company)
                    }
                    if let people = sitting.people, !compact {
                        HStack(spacing: 5) {
                            Image(systemName: "person.2").font(.system(size: T.s(10)))
                            Text("\(people)")
                        }
                    }
                }
                .font(.system(size: compact ? 11.5 : 12))
                .foregroundStyle(T.faint)
            }

            Spacer(minLength: 8)

            if let clash = sitting.clash, !compact {
                Text(clash)
                    .font(.system(size: T.s(12))).foregroundStyle(T.dim)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(T.sunken, in: RoundedRectangle(cornerRadius: 6))
            }

            Button {} label: {
                Image(systemName: "trash")
                    .font(.system(size: T.s(12)))
                    .foregroundStyle(hovering ? T.alarm : T.faint)
                    .frame(width: 26, height: 26)
            }
            .buttonStyle(.plain)
            .opacity(hovering ? 1 : 0.45)
            .help("Remove \(sitting.title) from today")
        }
        .padding(.horizontal, compact ? 6 : 15).padding(.vertical, compact ? 9 : 12)
        .background(rowFill)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .leading) {
            if sitting.live && !compact { Rectangle().fill(T.go).frame(width: 3) }
        }
        .overlay(
            compact ? nil :
                RoundedRectangle(cornerRadius: 10).strokeBorder(hovering ? T.lineFirm : T.line, lineWidth: 1)
        )
        .onHover { hovering = $0 }
    }

    private var rowFill: Color {
        if compact { return sitting.live ? T.goWash : (hovering ? T.cardHover : .clear) }
        return hovering ? T.cardHover : T.card
    }
}

// ── Shared: company pills ────────────────────────────────────────────────
/// Wraps. Never a suppressed horizontal scroller — that's what put five of ten
/// companies off-screen with no cue that they existed.
struct CompanyPicker: View {
    @Binding var selected: UUID

    var body: some View {
        FlowRow(spacing: 6) {
            ForEach(Sample.companies) { c in
                Button { selected = c.id } label: {
                    HStack(spacing: 7) {
                        Dot(color: c.color)
                        Text(c.name).font(.system(size: T.s(12.5), weight: selected == c.id ? .medium : .regular))
                    }
                    .foregroundStyle(selected == c.id ? T.text : T.dim)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(
                        Capsule().fill(selected == c.id ? T.card : T.sunken)
                            .overlay(Capsule().strokeBorder(selected == c.id ? T.lineFirm : T.line, lineWidth: 1))
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// A wrapping HStack. SwiftUI has no built-in one before iOS 16's Layout, and
/// this needs to work the same on every row width.
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxWidth, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX; y += rowHeight + spacing; rowHeight = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
