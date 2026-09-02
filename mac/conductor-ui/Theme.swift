import SwiftUI

enum Theme: String, CaseIterable, Identifiable {
    case dark, warm, light
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

/// The palette, plus the two things Settings can change about it.
///
/// `theme` and `scale` are plain statics rather than environment values so
/// every call site stays terse. Views re-read them because Shell re-identifies
/// the screen when either changes — see `content.id(...)`.
enum T {
    static var theme: Theme = .dark
    static var scale: CGFloat = 1

    /// Every font size goes through here, so the size control is real rather
    /// than a slider that does nothing.
    static func s(_ v: CGFloat) -> CGFloat { (v * scale).rounded() }

    static func hex(_ v: UInt32, _ a: Double = 1) -> Color {
        Color(.sRGB,
              red: Double((v >> 16) & 0xFF) / 255,
              green: Double((v >> 8) & 0xFF) / 255,
              blue: Double(v & 0xFF) / 255,
              opacity: a)
    }

    private static func pick(_ dark: UInt32, _ warm: UInt32, _ light: UInt32) -> Color {
        switch theme {
        case .dark:  return hex(dark)
        case .warm:  return hex(warm)
        case .light: return hex(light)
        }
    }

    private static var isLight: Bool { theme == .light }

    // Warm is the same architecture as dark, pulled further toward amber —
    // the middle setting for late in the day, not a second light theme.
    static var ground:    Color { pick(0x1D1D1B, 0x231F1A, 0xFAF9F5) }
    static var sidebar:   Color { pick(0x18181A, 0x1C1814, 0xF0EEE6) }
    static var card:      Color { pick(0x282725, 0x2E2823, 0xFFFFFF) }
    static var cardHover: Color { pick(0x31302D, 0x37302A, 0xF7F5F0) }
    static var sunken:    Color { pick(0x212120, 0x272219, 0xF3F1EA) }

    static var text:  Color { pick(0xE6E4E0, 0xEFE7DC, 0x2E2E2B) }
    static var dim:   Color { pick(0xA09D95, 0xB0A493, 0x6B6961) }
    static var faint: Color { pick(0x949084, 0xA0937F, 0x767469) }

    static var line:     Color { isLight ? .black.opacity(0.10) : .white.opacity(0.08) }
    static var lineFirm: Color { isLight ? .black.opacity(0.17) : .white.opacity(0.15) }

    static var accent:     Color { pick(0xD17B5C, 0xDD8455, 0xC2603A) }
    static var accentWash: Color { accent.opacity(isLight ? 0.10 : 0.13) }
    static var alarm:      Color { pick(0xDE8272, 0xE08268, 0xA8412F) }
    static var alarmWash:  Color { alarm.opacity(isLight ? 0.10 : 0.12) }
    static var go:         Color { pick(0x74AE87, 0x86B183, 0x3F7A54) }
    static var goWash:     Color { go.opacity(isLight ? 0.11 : 0.12) }
    static var amber:      Color { pick(0xE0A94A, 0xE8B057, 0xB07C1E) }
    static var amberWash:  Color { amber.opacity(isLight ? 0.13 : 0.15) }

    static var radius: CGFloat { 12 }

    /// AppKit-ish motion: fast and front-loaded. `easeInOut` at 400ms reads as web.
    static let ease  = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.26)
    static let quick = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.18)
}

/// What Settings actually changes. A reference type so the escaping bits read
/// it live, and so a single object can be handed to every screen.
@MainActor
final class UISettings: ObservableObject {
    @Published var theme: Theme = .dark { didSet { T.theme = theme } }
    @Published var scale: CGFloat = 1    { didSet { T.scale = scale } }

    /// Steps, not a slider — you want a size you can get back to.
    static let steps: [CGFloat] = [0.9, 1.0, 1.1, 1.25]
    var stepIndex: Int { UISettings.steps.firstIndex(of: scale) ?? 1 }
    var canShrink: Bool { stepIndex > 0 }
    var canGrow: Bool { stepIndex < UISettings.steps.count - 1 }

    func shrink() { if canShrink { scale = UISettings.steps[stepIndex - 1] } }
    func grow()   { if canGrow   { scale = UISettings.steps[stepIndex + 1] } }
    func resetSize() { scale = 1 }

    var sizeLabel: String {
        switch scale {
        case 0.9:  return "Small"
        case 1.1:  return "Large"
        case 1.25: return "Larger"
        default:   return "Default"
        }
    }
}

struct Cap: View {
    let text: String
    var color: Color = T.faint
    init(_ text: String, color: Color = T.faint) { self.text = text; self.color = color }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: T.s(10.5), weight: .semibold))
            .tracking(0.9)
            .foregroundStyle(color)
    }
}

struct KeyChip: View {
    let key: String
    var body: some View {
        Text(key)
            .font(.system(size: T.s(11), weight: .medium, design: .monospaced))
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
            .font(.system(size: T.s(11.5), weight: .medium))
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
    func cardSurface(_ radius: CGFloat = 12, fill: Color = T.card) -> some View {
        self.background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(T.line, lineWidth: 1))
    }
}
