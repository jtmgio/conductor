import SwiftUI

/// A task, opened.
///
/// The notes are the reason this screen exists. Most of these tasks arrive
/// from an agent with several hundred words of context attached — which
/// company asked, what's already been ruled out, what it's blocked on. A card
/// can only show the title, so this is where the actual work lives.
struct TaskDetailSheet: View {
    @Binding var isPresented: Bool
    let job: Job
    let company: Company

    @State private var status: String
    @State private var checked: Set<Int> = []

    init(isPresented: Binding<Bool>, job: Job, company: Company) {
        self._isPresented = isPresented
        self.job = job
        self.company = company
        self._status = State(initialValue: job.inProgress ? "In progress" : "Backlog")
    }

    private let statuses = ["Backlog", "In progress", "In review", "Blocked"]

    /// Stand-in for the checklist the refiner produces.
    private var steps: [String] {
        ["Pull last-login per user from the admin panel",
         "Ask Milos for the same list off their side",
         "Compare against the seat count on the renewal"]
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    facts

                    VStack(alignment: .leading, spacing: 10) {
                        Cap("Checklist")
                        VStack(spacing: 6) {
                            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                                Button {
                                    withAnimation(T.quick) {
                                        if checked.contains(i) { checked.remove(i) } else { checked.insert(i) }
                                    }
                                } label: {
                                    HStack(spacing: 11) {
                                        RoundedRectangle(cornerRadius: 5)
                                            .fill(checked.contains(i) ? T.go : .clear)
                                            .overlay(RoundedRectangle(cornerRadius: 5)
                                                .strokeBorder(checked.contains(i) ? T.go : T.lineFirm, lineWidth: 1.5))
                                            .overlay {
                                                if checked.contains(i) {
                                                    Image(systemName: "checkmark")
                                                        .font(.system(size: T.s(9), weight: .bold))
                                                        .foregroundStyle(T.hex(0x17150F))
                                                }
                                            }
                                            .frame(width: 16, height: 16)
                                        Text(step)
                                            .font(.system(size: T.s(13.5)))
                                            .foregroundStyle(checked.contains(i) ? T.faint : T.text)
                                            .strikethrough(checked.contains(i), color: T.faint)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, 4)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Cap("Notes")
                        Text(notes)
                            .font(.system(size: T.s(13.5)))
                            .foregroundStyle(T.dim)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                }
                .padding(.horizontal, 26).padding(.vertical, 22)
            }

            footer
        }
        .frame(width: 600, height: 620)
        .background(T.ground)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Dot(color: company.color)
                Text(company.name).font(.system(size: T.s(12.5))).foregroundStyle(T.dim)
                KeyChip(key: job.key)
                Spacer()
                Button { isPresented = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: T.s(12), weight: .semibold))
                        .foregroundStyle(T.faint)
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
            }
            Text(job.title)
                .font(.system(size: T.s(21), weight: .semibold))
                .foregroundStyle(T.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 26).padding(.top, 22).padding(.bottom, 18)
        .overlay(alignment: .bottom) { Rectangle().fill(T.line).frame(height: 1) }
    }

    private var facts: some View {
        HStack(alignment: .top, spacing: 30) {
            VStack(alignment: .leading, spacing: 8) {
                Cap("Status")
                HStack(spacing: 3) {
                    ForEach(statuses, id: \.self) { s in
                        Button { withAnimation(T.quick) { status = s } } label: {
                            Text(s)
                                .font(.system(size: T.s(11.5), weight: status == s ? .medium : .regular))
                                .foregroundStyle(status == s ? T.text : T.faint)
                                .padding(.horizontal, 9).padding(.vertical, 5)
                                .background(RoundedRectangle(cornerRadius: 6).fill(status == s ? T.card : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 8))
            }

            VStack(alignment: .leading, spacing: 8) {
                Cap("Due")
                Text(job.due ?? "No date")
                    .font(.system(size: T.s(13.5), weight: .medium))
                    .foregroundStyle(job.overdue ? T.alarm : T.text)
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(job.overdue ? T.alarmWash : T.sunken, in: RoundedRectangle(cornerRadius: 8))
            }

            Spacer()
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Button {} label: {
                HStack(spacing: 7) {
                    Image(systemName: "checkmark").font(.system(size: T.s(11), weight: .bold))
                    Text("Complete").font(.system(size: T.s(13.5), weight: .semibold))
                }
                .padding(.horizontal, 15).padding(.vertical, 9)
                .background(T.go, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(T.hex(0x17150F))
            }
            .buttonStyle(.plain)

            Button("Pull into today") {}
                .buttonStyle(.plain)
                .font(.system(size: T.s(13)))
                .foregroundStyle(T.dim)
                .padding(.horizontal, 13).padding(.vertical, 8)
                .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(T.lineFirm, lineWidth: 1))

            Spacer()

            // Deleting is not the same gesture as completing, and shouldn't
            // sit next to it looking like one.
            Button {} label: {
                Image(systemName: "trash")
                    .font(.system(size: T.s(12)))
                    .foregroundStyle(T.faint)
                    .frame(width: 30, height: 28)
            }
            .buttonStyle(.plain)
            .help("Delete task")
        }
        .padding(.horizontal, 26).padding(.vertical, 16)
        .overlay(alignment: .top) { Rectangle().fill(T.line).frame(height: 1) }
    }

    private var notes: String {
        """
        Jeff's ask (Slack DM 8/17): get usage confirmations on UX Cam.

        The actual question is NOT seat count. Milos confirmed UXCam prices on \
        session volume, not per seat — so removing users saves nothing. What \
        matters is whether anyone is opening the tool and watching the \
        recordings at all. If nobody is, the tool is dead weight regardless of \
        tier.

        Where to get it: UXCam dashboard admin/team section, or ask Milos to \
        pull last-login per user off their side. He is already in an open \
        thread (email 8/18, milos@uxcam.com).

        Context: renewed 8/14 for $6,113. Overage climbing — $45 April, $275 \
        June, $814 July, $760 August. Trailing twelve months $8,230.58.
        """
    }
}
