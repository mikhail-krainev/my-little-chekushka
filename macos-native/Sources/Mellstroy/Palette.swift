import AppKit

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r, green: g, blue: b, alpha: a)
}

func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat { a + (b - a) * t }

/// Colours of the drawn extras (bottle labels, overlays), sampled from the reference picture.
enum Palette {
    static let labelBlue = rgb(0.10, 0.15, 0.58)
    static let labelRed = rgb(0.78, 0.12, 0.17)
    static let skinLid = rgb(0.47, 0.35, 0.37)
    static let armSkin = rgb(0.58, 0.41, 0.35)
    static let lash = rgb(0.22, 0.13, 0.15)
    static let mouthDark = rgb(0.20, 0.08, 0.10)
    static let teeth = rgb(0.72, 0.66, 0.64)
}

enum TextFit {
    private static func font(_ size: CGFloat) -> NSFont {
        NSFont(name: "Impact", size: size) ?? NSFont(name: "HelveticaNeue-CondensedBlack", size: size) ?? .systemFont(ofSize: size, weight: .black)
    }

    /// Draws `text` stretched to fill `rect` as exactly as the font allows.
    static func draw(_ text: String, rect: CGRect, color: CGColor) {
        let probe: CGFloat = 20
        let nsColor = NSColor(cgColor: color) ?? .black
        let size = NSAttributedString(string: text, attributes: [.font: font(probe), .foregroundColor: nsColor]).size()
        let k = min(rect.width / size.width, rect.height / (size.height * 0.78))
        let fitted = NSAttributedString(string: text, attributes: [.font: font(probe * k), .foregroundColor: nsColor])
        let s = fitted.size()
        fitted.draw(at: CGPoint(x: rect.midX - s.width / 2, y: rect.midY - s.height * 0.54))
    }
}
