import SwiftUI

/// Pick tomorrow before today ends.
///
/// A screen, not a sheet. Planning is a deliberate sit-down — you scroll it,
/// you compare across companies, you change your mind — and a 620pt box makes
/// all three awkward. Two columns above ~1100pt so five companies are visible
/// at once rather than remembered.
///
/// Deliberately not a list of everything: each company offers its top few. The
/// point is to take a handful, not to triage, and nothing here counts what you
/// left behind.
struct PlanView: View {
    @EnvironmentObject var sheets: Sheets
    @State private var picked: Set<UUID> = []

    private let perCompany = 3

    private var offers: [(Company, [Job])] {
        Sample.companies.prefix(6).compactMap { c in
            guard let jobs = Sample.byCompany[c.name], !jobs.isEmpty else { return nil }
            return (c, Array(jobs.prefix(perCompany)))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            GeometryReader { geo in
                ScrollView {
                    let columns = geo.size.width > 1100 ? 2 : 1
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible(), spacing: 22, alignment: .top), count: columns),
                        alignment: .leading,
                        spacing: 26
                    ) {
                        ForEach(offers, id: \.0.id) { company, jobs in
                            section(company, jobs)
                        }
                    }
                    .padding(.horizontal, 30)
                    .padding(.top, 22)
                    .padding(.bottom, 30)
                }
            }

            footer
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Plan tomorrow")
                    .font(.system(size: T.s(30), weight: .semibold))
                    .foregroundStyle(T.text)
                Text("Saturday 22 August")
                    .font(.system(size: T.s(14)))
                    .foregroundStyle(T.dim)
                Spacer()
            }
            Text("Take a handful, not a list. Whatever you skip stays where it is.")
                .font(.system(size: T.s(14)))
                .foregroundStyle(T.dim)
                .padding(.top, 6)
        }
        .padding(.horizontal, 30).padding(.top, 44)
    }

    private func section(_ company: Company, _ jobs: [Job]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Dot(color: company.color)
                Text(company.name)
                    .font(.system(size: T.s(14.5), weight: .semibold))
                    .foregroundStyle(T.text)
                Text(company.title)
                    .font(.system(size: T.s(12)))
                    .foregroundStyle(T.faint)
                Spacer()
            }

            VStack(spacing: 6) {
                ForEach(jobs) { job in
                    PickRow(job: job, tint: company.color, on: picked.contains(job.id)) {
                        withAnimation(T.quick) {
                            if picked.contains(job.id) { picked.remove(job.id) } else { picked.insert(job.id) }
                        }
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            // Words, not a tally of what you didn't pick.
            HStack(spacing: 8) {
                Image(systemName: picked.isEmpty ? "circle.dashed" : "checkmark.circle.fill")
                    .font(.system(size: T.s(13)))
                Text(picked.isEmpty ? "Nothing picked yet" : "Ready for tomorrow")
                    .font(.system(size: T.s(13)))
            }
            .foregroundStyle(picked.isEmpty ? T.faint : T.go)

            Spacer()

            Button("Skip tonight") { sheets.planning = false }
                .buttonStyle(.plain)
                .font(.system(size: T.s(13)))
                .foregroundStyle(T.faint)

            Button {} label: {
                HStack(spacing: 7) {
                    Text("Set tomorrow").font(.system(size: T.s(13.5), weight: .semibold))
                    Text("⌘↩").font(.system(size: T.s(11), weight: .semibold)).opacity(0.55)
                }
                .padding(.horizontal, 15).padding(.vertical, 9)
                .background(picked.isEmpty ? T.sunken : T.accent, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(picked.isEmpty ? T.faint : T.hex(0x17150F))
            }
            .buttonStyle(.plain)
            .disabled(picked.isEmpty)
        }
        .padding(.horizontal, 30).padding(.vertical, 14)
        .background(T.sidebar)
        .overlay(alignment: .top) { Rectangle().fill(T.line).frame(height: 1) }
    }
}

private struct PickRow: View {
    let job: Job
    let tint: Color
    let on: Bool
    let tap: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(on ? tint : .clear)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(on ? tint : T.lineFirm, lineWidth: 1.5))
                    .overlay {
                        if on {
                            Image(systemName: "checkmark")
                                .font(.system(size: T.s(10), weight: .bold))
                                .foregroundStyle(T.hex(0x17150F))
                        }
                    }
                    .frame(width: 18, height: 18)

                Text(job.title)
                    .font(.system(size: T.s(14)))
                    .foregroundStyle(T.text)
                    .lineLimit(1)
                Spacer(minLength: 10)
                KeyChip(key: job.key)
                if let due = job.due {
                    Text(due)
                        .font(.system(size: T.s(11.5)))
                        .foregroundStyle(job.overdue ? T.alarm : T.faint)
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 9)
                    .fill(on ? tint.opacity(0.10) : (hovering ? T.cardHover : T.card))
                    .overlay(RoundedRectangle(cornerRadius: 9)
                        .strokeBorder(on ? tint.opacity(0.4) : T.line, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}
