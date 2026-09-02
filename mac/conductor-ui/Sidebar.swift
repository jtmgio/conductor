import SwiftUI

/// The nav rail. Labelled at 216pt, collapsing to icons at 60pt.
///
/// Labels rather than a bare icon strip: six unlabelled glyphs make you decode
/// where you're going. The block card at the bottom is the one place the rail
/// says something instead of just navigating.
struct Sidebar: View {
    @Binding var screen: Screen
    @Binding var collapsed: Bool

    private let block = Sample.companies[0]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Clear of the traffic lights, which sit over this in a
            // full-size-content window.
            Spacer().frame(height: 38)

            brand
                .padding(.horizontal, collapsed ? 0 : 10)
                .padding(.bottom, 14)
                .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)

            VStack(spacing: 2) {
                ForEach([Screen.today, .board, .plan, .formatter, .meetings]) { s in
                    NavRow(screen: s, active: screen == s, collapsed: collapsed) { screen = s }
                }
            }

            Spacer()

            blockCard.padding(.bottom, 8)

            NavRow(screen: .settings, active: screen == .settings, collapsed: collapsed) { screen = .settings }
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 12)
        .frame(width: collapsed ? 60 : 216)
        .background(T.sidebar)
        .overlay(alignment: .trailing) { Rectangle().fill(T.line).frame(width: 1) }
    }

    private var brand: some View {
        HStack(spacing: 9) {
            RoundedRectangle(cornerRadius: 7)
                .fill(T.accent)
                .frame(width: 23, height: 23)
                .overlay(
                    Image(systemName: "waveform.path")
                        .font(.system(size: T.s(11), weight: .bold))
                        .foregroundStyle(.white)
                )
            if !collapsed {
                Text("Conductor")
                    .font(.system(size: T.s(14.5), weight: .semibold))
                    .foregroundStyle(T.text)
            }
        }
    }

    private var blockCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !collapsed { Cap("In focus").padding(.bottom, 6) }
            HStack(spacing: 7) {
                Dot(color: block.color)
                if !collapsed {
                    Text(block.name).font(.system(size: T.s(14.5), weight: .semibold)).foregroundStyle(T.text)
                }
            }
            if !collapsed {
                Text("Morning · 7:00 – 9:00")
                    .font(.system(size: T.s(12)).monospacedDigit())
                    .foregroundStyle(T.dim)
                    .padding(.top, 3)
            }
            ProgressBar(fraction: 0.16, tint: block.color).padding(.top, 9)
        }
        .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
        .padding(collapsed ? 9 : 12)
        .cardSurface(10)
    }
}

private struct NavRow: View {
    let screen: Screen
    let active: Bool
    let collapsed: Bool
    let tap: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 11) {
                Image(systemName: screen.icon)
                    .font(.system(size: T.s(14), weight: .medium))
                    .foregroundStyle(active ? T.accent : T.dim)
                    .frame(width: 16)
                if !collapsed {
                    Text(screen.label)
                        .font(.system(size: T.s(14), weight: active ? .medium : .regular))
                        .foregroundStyle(active ? T.text : T.dim)
                    Spacer(minLength: 0)
                    if hovering {
                        Text("⌘\(String(screen.shortcut.character))")
                            .font(.system(size: T.s(11)))
                            .foregroundStyle(T.faint)
                    }
                }
            }
            .padding(.horizontal, collapsed ? 0 : 10)
            .frame(maxWidth: .infinity, minHeight: 35, alignment: collapsed ? .center : .leading)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(active ? T.card : (hovering ? T.cardHover : .clear))
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(screen.label)
    }
}

struct ProgressBar: View {
    let fraction: Double
    var tint: Color = T.accent
    var height: CGFloat = 3

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(T.lineFirm)
                Capsule().fill(tint).frame(width: max(2, geo.size.width * fraction))
            }
        }
        .frame(height: height)
    }
}
