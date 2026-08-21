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
            Text("Formatter").font(.system(size: 30, weight: .semibold)).foregroundStyle(T.text)
            Text("Paste a rough draft. Get it back in your voice, on the clipboard.")
                .font(.system(size: 14)).foregroundStyle(T.dim).padding(.top, 6)

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
                        .font(.system(size: 12, weight: platform == p ? .medium : .regular))
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
                .font(.system(size: 14.5))
                .foregroundStyle(T.dim)
                .scrollContentBackground(.hidden)
                .padding(12)
                .frame(maxHeight: .infinity)

            Divider().overlay(T.line)
            VStack(spacing: 9) {
                Text("Enter to format · Shift+Enter for a new line")
                    .font(.system(size: 12)).foregroundStyle(T.faint)
                Button {} label: {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("Format in my voice").font(.system(size: 14, weight: .semibold))
                        Text("⏎").font(.system(size: 11, weight: .semibold)).opacity(0.55)
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
                        Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 11))
                        Text(copied ? "Copied" : "Copy").font(.system(size: 13))
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
                        .font(.system(size: 14.5, weight: .semibold))
                    Text("Findings 096 and 097 landed in trinity dbdc6c99 and are applied locally and on the tower review env. Prod has not been migrated.")
                        .font(.system(size: 14.5))
                    Text("When it lands, delivery counts roughly double on any LP with wide offer fan-out, and any LP with a paused attachment starts showing a Paused count.")
                        .font(.system(size: 14.5))
                    Text("I don't want this going out unannounced — @Ranjith, can you call the timing?")
                        .font(.system(size: 14.5))

                    Divider().overlay(T.line).padding(.top, 6)
                    Text("Copies with formatting, so Slack renders the bold and code chips rather than literal backticks.")
                        .font(.system(size: 12.5)).foregroundStyle(T.faint)
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
/// Source list plus content pane — the macOS System Settings shape. Nine
/// sections one level deep, rather than tabs nested inside tabs.
struct SettingsView: View {
    @State private var section = "Companies"

    private let sections: [(String, String)] = [
        ("Companies", "building.2"), ("Your voice", "mic"), ("Schedule", "calendar"),
        ("Integrations", "link"), ("Skills", "bolt"), ("API keys", "key"),
        ("Costs", "dollarsign.circle"), ("Shortcuts", "keyboard"), ("Reset & backup", "arrow.counterclockwise"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Settings").font(.system(size: 30, weight: .semibold)).foregroundStyle(T.text)
            Text("Nine sections, one level deep.")
                .font(.system(size: 14)).foregroundStyle(T.dim).padding(.top, 6)
                .padding(.bottom, 20)

            HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 1) {
                    ForEach(sections, id: \.0) { name, icon in
                        Button { section = name } label: {
                            HStack(spacing: 10) {
                                Image(systemName: icon)
                                    .font(.system(size: 12))
                                    .foregroundStyle(section == name ? T.accent : T.dim)
                                    .frame(width: 15)
                                Text(name).font(.system(size: 13.5, weight: section == name ? .medium : .regular))
                                    .foregroundStyle(section == name ? T.text : T.dim)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 8).fill(section == name ? T.card : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                }
                .frame(width: 200)
                .padding(.trailing, 10)

                Rectangle().fill(T.line).frame(width: 1)

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(section).font(.system(size: 20, weight: .semibold)).foregroundStyle(T.text)
                        Text("Priority order decides the waterfall — when a block has no work, Conductor pulls from the highest company that does.")
                            .font(.system(size: 13.5)).foregroundStyle(T.dim)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 4).padding(.bottom, 20)

                        VStack(spacing: 0) {
                            ForEach(Array(Sample.companies.enumerated()), id: \.element.id) { i, c in
                                if i > 0 { Divider().overlay(T.line) }
                                HStack(spacing: 12) {
                                    Dot(color: c.color)
                                    Text(c.name).font(.system(size: 14.5)).foregroundStyle(T.text)
                                    Text(c.title).font(.system(size: 12.5)).foregroundStyle(T.faint)
                                    Spacer()
                                    KeyChip(key: c.prefix)
                                    Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(T.faint)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 13)
                            }
                        }
                        .cardSurface()
                        // Readable measure — the web page runs full-bleed at 1329px.
                        .frame(maxWidth: 620)
                    }
                    .padding(.leading, 30).padding(.trailing, 34).padding(.bottom, 40)
                }
            }
        }
        .padding(.leading, 30).padding(.top, 44)
    }
}

// ── Tracker placeholder ──────────────────────────────────────────────────
struct TrackerView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tracker").font(.system(size: 30, weight: .semibold)).foregroundStyle(T.text)
            Text("Not designed yet — deliberately left out of this pass.")
                .font(.system(size: 14)).foregroundStyle(T.dim)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 30).padding(.top, 44)
    }
}
