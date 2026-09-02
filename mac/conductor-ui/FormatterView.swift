import SwiftUI

/// Paste a rough draft, get it back in your voice.
///
/// Company and platform are both pickable. Deriving them from the current
/// schedule block — which is what the web page does — makes a Teams message to
/// one company impossible to write while you're sitting in another's block.
struct FormatterView: View {
    @State private var company = Sample.companies[0].id
    @State private var platform = "Slack"
    @State private var draft = Sample.draft
    @State private var copied = false

    private let platforms = ["Slack", "Teams", "Email", "SMS"]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Formatter").font(.system(size: T.s(30), weight: .semibold)).foregroundStyle(T.text)
            Text("Paste a rough draft. Get it back in your voice, on the clipboard.")
                .font(.system(size: T.s(14))).foregroundStyle(T.dim).padding(.top, 6)

            HStack(alignment: .center, spacing: 12) {
                CompanyPicker(selected: $company)
                Spacer(minLength: 12)
                segmented
            }
            .padding(.top, 18)

            HStack(alignment: .top, spacing: 18) {
                draftPane
                outputPane
            }
            .padding(.top, 20)
        }
        .padding(.horizontal, 30).padding(.top, 44).padding(.bottom, 26)
    }

    private var segmented: some View {
        HStack(spacing: 3) {
            ForEach(platforms, id: \.self) { p in
                Button { platform = p } label: {
                    Text(p)
                        .font(.system(size: T.s(12), weight: platform == p ? .medium : .regular))
                        .foregroundStyle(platform == p ? T.text : T.faint)
                        .padding(.horizontal, 11).padding(.vertical, 5)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(platform == p ? T.card : .clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(T.sunken, in: RoundedRectangle(cornerRadius: 8))
    }

    private var draftPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Cap("Rough draft")
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            Divider().overlay(T.line)

            TextEditor(text: $draft)
                .font(.system(size: T.s(14.5)))
                .foregroundStyle(T.dim)
                .scrollContentBackground(.hidden)
                .padding(12)
                .frame(maxHeight: .infinity)

            Divider().overlay(T.line)
            VStack(spacing: 9) {
                Text("Enter to format · Shift+Enter for a new line")
                    .font(.system(size: T.s(12))).foregroundStyle(T.faint)
                Button {} label: {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("Format in my voice").font(.system(size: T.s(14), weight: .semibold))
                        Text("⏎").font(.system(size: T.s(11), weight: .semibold)).opacity(0.55)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(T.accent, in: RoundedRectangle(cornerRadius: 11))
                    .foregroundStyle(T.hex(0x17150F))
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .cardSurface()
    }

    private var outputPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Cap("In your voice · \(platform)")
                Spacer()
                Button {
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { copied = false }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: T.s(11)))
                        Text(copied ? "Copied" : "Copy").font(.system(size: T.s(13)))
                    }
                    .foregroundStyle(copied ? T.go : T.dim)
                    .padding(.horizontal, 11).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(T.lineFirm, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            Divider().overlay(T.line)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("report_configs_v2 fixes are committed but not in prod.")
                        .font(.system(size: T.s(14.5), weight: .semibold))
                    Text("Findings 096 and 097 landed in trinity dbdc6c99 and are applied locally and on the tower review env. Prod has not been migrated.")
                        .font(.system(size: T.s(14.5)))
                    Text("When it lands, delivery counts roughly double on any LP with wide offer fan-out, and any LP with a paused attachment starts showing a Paused count.")
                        .font(.system(size: T.s(14.5)))
                    Text("I don't want this going out unannounced — @Ranjith, can you call the timing?")
                        .font(.system(size: T.s(14.5)))

                    Divider().overlay(T.line).padding(.top, 6)
                    Text("Copies with formatting, so Slack renders the bold and code chips rather than literal backticks.")
                        .font(.system(size: T.s(12.5))).foregroundStyle(T.faint)
                }
                .foregroundStyle(T.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .cardSurface()
    }
}

// ── Settings ─────────────────────────────────────────────────────────────
/// Six things.
///
/// The web app has four tabs with four more tabs nested inside one of them —
/// nine sections, 42 controls, no headings. Almost none of it gets touched.
/// What actually gets used is two preferences and four actions, so that's what
/// this is: no source list, no search, nothing to navigate.
struct SettingsView: View {
    @EnvironmentObject var ui: UISettings
    @State private var confirmingReset = false
    @State private var syncing = false
    @State private var syncedAt: String? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Settings").font(.system(size: T.s(30), weight: .semibold)).foregroundStyle(T.text)
                Text("Two preferences and four things you can do.")
                    .font(.system(size: T.s(14))).foregroundStyle(T.dim).padding(.top, 6)

                Cap("Appearance").padding(.top, 28).padding(.bottom, 10)
                VStack(spacing: 0) {
                    Row(icon: "circle.lefthalf.filled", title: "Theme",
                        detail: "Dark for the day, warm for the evening.") {
                        HStack(spacing: 3) {
                            ForEach(Theme.allCases) { t in
                                Button { withAnimation(T.quick) { ui.theme = t } } label: {
                                    Text(t.label)
                                        .font(.system(size: T.s(12), weight: ui.theme == t ? .medium : .regular))
                                        .foregroundStyle(ui.theme == t ? T.text : T.faint)
                                        .padding(.horizontal, 11).padding(.vertical, 5)
                                        .background(RoundedRectangle(cornerRadius: 6).fill(ui.theme == t ? T.card : .clear))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(3)
                        .background(T.sunken, in: RoundedRectangle(cornerRadius: 8))
                    }

                    Divider().overlay(T.line)

                    Row(icon: "textformat.size", title: "Text size",
                        detail: "Scales the whole interface, not just the body copy.") {
                        HStack(spacing: 8) {
                            stepper("minus", enabled: ui.canShrink) { ui.shrink() }
                            Text(ui.sizeLabel)
                                .font(.system(size: T.s(12.5), weight: .medium))
                                .foregroundStyle(T.text)
                                .frame(width: 62)
                            stepper("plus", enabled: ui.canGrow) { ui.grow() }
                            if ui.scale != 1 {
                                Button("Reset") { withAnimation(T.quick) { ui.resetSize() } }
                                    .buttonStyle(.plain)
                                    .font(.system(size: T.s(12)))
                                    .foregroundStyle(T.faint)
                            }
                        }
                    }
                }
                .cardSurface()
                .frame(maxWidth: 640)

                Cap("Your day").padding(.top, 26).padding(.bottom, 10)
                VStack(spacing: 0) {
                    Row(icon: "sunrise", title: "Start day now",
                        detail: "Shifts every block forward so the schedule matches when you actually sat down.") {
                        Button("Start") {}.buttonStyle(Solid())
                    }

                    Divider().overlay(T.line)

                    Row(icon: "arrow.counterclockwise", title: "Reset today's tasks",
                        detail: confirmingReset
                            ? "Everything scheduled for today goes back to backlog. Nothing is deleted."
                            : "Clears today's plan so you can pick it again.") {
                        if confirmingReset {
                            HStack(spacing: 8) {
                                Button("Cancel") { withAnimation(T.quick) { confirmingReset = false } }
                                    .buttonStyle(.plain)
                                    .font(.system(size: T.s(12.5)))
                                    .foregroundStyle(T.faint)
                                Button("Reset") { withAnimation(T.quick) { confirmingReset = false } }
                                    .buttonStyle(Solid(tint: T.alarm))
                            }
                        } else {
                            // The one destructive action here, so it asks once.
                            Button("Reset") { withAnimation(T.quick) { confirmingReset = true } }
                                .buttonStyle(Outline())
                        }
                    }

                    Divider().overlay(T.line)

                    Row(icon: "calendar.badge.clock", title: "Re-sync calendar",
                        detail: syncedAt.map { "Last synced \($0)." } ?? "Pulls today's meetings again if something looks stale.") {
                        Button {
                            syncing = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                                syncing = false
                                syncedAt = "just now"
                            }
                        } label: {
                            HStack(spacing: 7) {
                                if syncing {
                                    ProgressView().controlSize(.small)
                                } else if syncedAt != nil {
                                    Image(systemName: "checkmark").font(.system(size: T.s(11), weight: .bold))
                                }
                                Text(syncing ? "Syncing" : "Sync now")
                            }
                        }
                        .buttonStyle(Outline())
                        .disabled(syncing)
                    }
                }
                .cardSurface()
                .frame(maxWidth: 640)

                Cap("Account").padding(.top, 26).padding(.bottom, 10)
                VStack(spacing: 0) {
                    Row(icon: "rectangle.portrait.and.arrow.right", title: "Sign out",
                        detail: "You'll need the password next time.") {
                        Button("Sign out") {}.buttonStyle(Outline(tint: T.alarm))
                    }
                }
                .cardSurface()
                .frame(maxWidth: 640)

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 30).padding(.top, 44)
        }
    }

    private func stepper(_ icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button { withAnimation(T.quick) { action() } } label: {
            Image(systemName: icon)
                .font(.system(size: T.s(12), weight: .semibold))
                .foregroundStyle(enabled ? T.text : T.faint.opacity(0.5))
                .frame(width: 28, height: 26)
                .background(T.sunken, in: RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

/// One settings line: icon, what it is, what it does, and its control.
private struct Row<Control: View>: View {
    let icon: String
    let title: String
    let detail: String
    @ViewBuilder var control: Control

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: T.s(15)))
                .foregroundStyle(T.dim)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: T.s(14.5), weight: .medium)).foregroundStyle(T.text)
                // Every row says what it does. Settings that only name
                // themselves make you click to find out.
                Text(detail)
                    .font(.system(size: T.s(12.5)))
                    .foregroundStyle(T.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            control
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }
}

private struct Solid: ButtonStyle {
    var tint: Color = T.accent
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: T.s(12.5), weight: .semibold))
            .foregroundStyle(T.hex(0x17150F))
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(tint.opacity(configuration.isPressed ? 0.8 : 1), in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct Outline: ButtonStyle {
    var tint: Color = T.dim
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: T.s(12.5), weight: .medium))
            .foregroundStyle(tint)
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(configuration.isPressed ? T.cardHover : .clear)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(tint.opacity(0.45), lineWidth: 1))
            )
    }
}
