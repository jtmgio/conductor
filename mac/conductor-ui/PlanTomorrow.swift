import SwiftUI

/// Pick tomorrow before today ends.
///
/// Deliberately not a list of everything: each company offers its top few, and
/// the whole point is that you take a handful, not that you triage. Nothing
/// here counts what you left behind.
struct PlanTomorrowSheet: View {
    @Binding var isPresented: Bool
    @State private var picked: Set<UUID> = []
    @State private var expanded: UUID?

    /// Two or three per company is the shape of a day that survives contact
    /// with ten meetings — so that's what it shows without asking.
    private let perCompany = 3

    private var offers: [(Company, [Job])] {
        Sample.companies.prefix(5).compactMap { c in
            guard let jobs = Sample.byCompany[c.name], !jobs.isEmpty else { return nil }
            return (c, Array(jobs.prefix(perCompany)))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(offers, id: \.0.id) { company, jobs in
                        VStack(alignment: .leading, spacing: 8) {
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
                                    PickRow(job: job,
                                            tint: company.color,
                                            on: picked.contains(job.id)) {
                                        withAnimation(T.quick) {
                                            if picked.contains(job.id) { picked.remove(job.id) }
                                            else { picked.insert(job.id) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 26).padding(.vertical, 22)
            }

            footer
        }
        .frame(width: 620, height: 640)
        .background(T.ground)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Plan tomorrow")
                        .font(.system(size: T.s(22), weight: .semibold))
                        .foregroundStyle(T.text)
                    Text("Saturday 22 August · take a handful, not a list.")
                        .font(.system(size: T.s(13)))
                        .foregroundStyle(T.dim)
                }
                Spacer()
                Button { isPresented = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: T.s(12), weight: .semibold))
                        .foregroundStyle(T.faint)
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 26).padding(.top, 24).padding(.bottom, 18)
        .overlay(alignment: .bottom) { Rectangle().fill(T.line).frame(height: 1) }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            // Words, not a tally of what you didn't pick.
            Text(picked.isEmpty ? "Nothing picked yet" : "Ready for tomorrow")
                .font(.system(size: T.s(12.5)))
                .foregroundStyle(picked.isEmpty ? T.faint : T.go)
            Spacer()
            Button("Skip") { isPresented = false }
                .buttonStyle(.plain)
                .font(.system(size: T.s(13)))
                .foregroundStyle(T.faint)
            Button { isPresented = false } label: {
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
        .padding(.horizontal, 26).padding(.vertical, 16)
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
