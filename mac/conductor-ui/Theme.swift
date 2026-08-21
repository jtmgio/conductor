import SwiftUI

/// The Claude-treatment palette, as SwiftUI colors.
///
/// Values are lifted from the running web app's own tokens (--background
/// #1D1D1B, --primary #D17B5C, --foreground #E6E4E0, radius 12) so the two
/// stay recognisably the same product.
enum T {
    static func hex(_ v: UInt32, _ a: Double = 1) -> Color {
        Color(.sRGB,
              red: Double((v >> 16) & 0xFF) / 255,
              green: Double((v >> 8) & 0xFF) / 255,
              blue: Double(v & 0xFF) / 255,
              opacity: a)
    }

    static let ground     = hex(0x1D1D1B)
    static let sidebar    = hex(0x18181A)
    static let card       = hex(0x282725)
    static let cardHover  = hex(0x31302D)
    static let sunken     = hex(0x212120)

    static let text       = hex(0xE6E4E0)
    static let dim        = hex(0xA09D95)
    static let faint      = hex(0x949084)   // raised from #747067 — that failed WCAG AA at 3.0:1

    static let line       = Color.white.opacity(0.08)
    static let lineFirm   = Color.white.opacity(0.15)

    static let accent     = hex(0xD17B5C)
    static let accentWash = hex(0xD17B5C, 0.13)
    static let alarm      = hex(0xDE8272)
    static let alarmWash  = hex(0xDE8272, 0.12)
    static let go         = hex(0x74AE87)
    static let goWash     = hex(0x74AE87, 0.12)
    static let amber      = hex(0xE0A94A)
    static let amberWash  = hex(0xE0A94A, 0.15)

    static let radius: CGFloat = 12

    /// AppKit-ish motion: fast and front-loaded. `easeInOut` at 400ms reads as web.
    static let ease  = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.26)
    static let quick = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.18)
}

/// A caption — small, uppercase, tracked.
struct Cap: View {
    let text: String
    var color: Color = T.faint
    init(_ text: String, color: Color = T.faint) { self.text = text; self.color = color }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10.5, weight: .semibold))
            .tracking(0.9)
            .foregroundStyle(color)
    }
}

/// A task key chip — VQ-163. How tasks get named out loud.
struct KeyChip: View {
    let key: String
    var body: some View {
        Text(key)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(T.accent)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(T.accentWash, in: RoundedRectangle(cornerRadius: 5))
    }
}

struct Pill: View {
    let text: String
    var fg: Color = T.dim
    var bg: Color = T.sunken
    var body: some View {
        Text(text)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(fg)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(bg, in: Capsule())
    }
}

struct Dot: View {
    let color: Color
    var size: CGFloat = 7
    var body: some View { Circle().fill(color).frame(width: size, height: size) }
}

extension View {
    /// The standard raised surface: card fill, hairline border, 12pt radius.
    func cardSurface(_ radius: CGFloat = T.radius, fill: Color = T.card) -> some View {
        self.background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(T.line, lineWidth: 1))
    }
}
