import AppKit

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r, green: g, blue: b, alpha: a)
}

func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat { a + (b - a) * t }

/// Colours of the mascot, sampled from the reference picture.
enum Palette {
    static let skin = rgb(0.95, 0.80, 0.72)
    static let skinShade = rgb(0.84, 0.64, 0.56)
    static let skinArm = rgb(0.93, 0.76, 0.66)
    static let hair = rgb(0.15, 0.10, 0.09)
    static let hairLight = rgb(0.32, 0.23, 0.19)
    static let shirt = rgb(0.10, 0.10, 0.11)
    static let shirtLight = rgb(0.22, 0.22, 0.24)
    static let pants = rgb(0.09, 0.09, 0.10)
    static let outline = rgb(0.20, 0.27, 0.32, 0.65)
    static let labelBlue = rgb(0.10, 0.15, 0.58)
    static let labelRed = rgb(0.78, 0.12, 0.17)
    static let paper = rgb(0.91, 0.93, 0.95)
    static let ink = rgb(0.13, 0.10, 0.10)
}

/// Bottle, label, face: everything that sits on the glass body.
enum MascotBodyDrawing {
    static let cx = MascotRig.centerX

    static func bottlePath(inset: CGFloat = 0) -> CGPath {
        let neckHalf: CGFloat = 11 - inset, bodyHalf: CGFloat = 34 - inset
        let base: CGFloat = 22 + inset
        let p = CGMutablePath()
        p.move(to: CGPoint(x: cx - neckHalf, y: 168))
        p.addLine(to: CGPoint(x: cx - neckHalf, y: 154))
        p.addCurve(to: CGPoint(x: cx - bodyHalf, y: 112), control1: CGPoint(x: cx - neckHalf, y: 134), control2: CGPoint(x: cx - bodyHalf, y: 134))
        p.addLine(to: CGPoint(x: cx - bodyHalf, y: 36))
        p.addQuadCurve(to: CGPoint(x: cx - bodyHalf + 13, y: base), control: CGPoint(x: cx - bodyHalf, y: base))
        p.addLine(to: CGPoint(x: cx + bodyHalf - 13, y: base))
        p.addQuadCurve(to: CGPoint(x: cx + bodyHalf, y: 36), control: CGPoint(x: cx + bodyHalf, y: base))
        p.addLine(to: CGPoint(x: cx + bodyHalf, y: 112))
        p.addCurve(to: CGPoint(x: cx + neckHalf, y: 154), control1: CGPoint(x: cx + bodyHalf, y: 134), control2: CGPoint(x: cx + neckHalf, y: 134))
        p.addLine(to: CGPoint(x: cx + neckHalf, y: 168))
        p.closeSubpath()
        return p
    }

    // MARK: Layers

    /// Everything seen through the glass, clipped to the bottle.
    static func drawInterior(_ ctx: CGContext, face: Face, blink: Bool) {
        ctx.saveGState()
        ctx.addPath(bottlePath(inset: 1.2)); ctx.clip()
        drawGlassBase(ctx)
        drawShirt(ctx)
        drawFace(ctx, face, blink: blink)
        drawLabel(ctx)
        ctx.restoreGState()
    }

    static func drawGlassBack(_ ctx: CGContext) {
        ctx.saveGState()
        ctx.addPath(bottlePath()); ctx.clip()
        let space = CGColorSpaceCreateDeviceRGB()
        let colors = [rgb(0.70, 0.82, 0.88, 0.55), rgb(0.92, 0.97, 1.0, 0.18), rgb(0.92, 0.97, 1.0, 0.14), rgb(0.66, 0.78, 0.85, 0.50)] as CFArray
        if let g = CGGradient(colorsSpace: space, colors: colors, locations: [0, 0.22, 0.7, 1]) {
            ctx.drawLinearGradient(g, start: CGPoint(x: cx - 34, y: 0), end: CGPoint(x: cx + 34, y: 0), options: [])
        }
        ctx.restoreGState()
    }

    private static func drawGlassBase(_ ctx: CGContext) {
        // thick glass bottom
        let r = CGRect(x: cx - 36, y: 20, width: 72, height: 13)
        ctx.setFillColor(rgb(0.88, 0.94, 0.97, 0.75)); ctx.fill(r)
        ctx.setStrokeColor(rgb(1, 1, 1, 0.8)); ctx.setLineWidth(0.9)
        ctx.move(to: CGPoint(x: cx - 33, y: 33)); ctx.addQuadCurve(to: CGPoint(x: cx + 33, y: 33), control: CGPoint(x: cx, y: 36)); ctx.strokePath()
        ctx.setStrokeColor(rgb(0.45, 0.58, 0.66, 0.5)); ctx.setLineWidth(0.7)
        ctx.move(to: CGPoint(x: cx - 33, y: 29.5)); ctx.addQuadCurve(to: CGPoint(x: cx + 33, y: 29.5), control: CGPoint(x: cx, y: 32.5)); ctx.strokePath()
    }

    private static func drawShirt(_ ctx: CGContext) {
        // neck
        ctx.setFillColor(Palette.skinShade)
        ctx.fill(CGRect(x: cx - 7.5, y: 86, width: 15, height: 14))
        // t-shirt behind the label
        let p = CGMutablePath()
        p.move(to: CGPoint(x: 24, y: 46))
        p.addLine(to: CGPoint(x: 24, y: 88))
        p.addCurve(to: CGPoint(x: cx - 9, y: 95), control1: CGPoint(x: 32, y: 92), control2: CGPoint(x: 46, y: 94))
        p.addQuadCurve(to: CGPoint(x: cx + 9, y: 95), control: CGPoint(x: cx, y: 82))
        p.addCurve(to: CGPoint(x: 96, y: 88), control1: CGPoint(x: 74, y: 94), control2: CGPoint(x: 88, y: 92))
        p.addLine(to: CGPoint(x: 96, y: 46))
        p.closeSubpath()
        ctx.setFillColor(Palette.shirt); ctx.addPath(p); ctx.fillPath()
        ctx.setStrokeColor(Palette.shirtLight); ctx.setLineWidth(0.8)
        ctx.move(to: CGPoint(x: cx - 9, y: 95)); ctx.addQuadCurve(to: CGPoint(x: cx + 9, y: 95), control: CGPoint(x: cx, y: 82)); ctx.strokePath()
        // folds
        ctx.setStrokeColor(rgb(0.25, 0.25, 0.28, 0.6)); ctx.setLineWidth(0.6)
        for x in [32.0, 44.0, 76.0, 88.0] as [CGFloat] { ctx.move(to: CGPoint(x: x, y: 86)); ctx.addLine(to: CGPoint(x: x + 2, y: 70)); ctx.strokePath() }
    }

    // MARK: Face

    static func drawFace(_ ctx: CGContext, _ f: Face, blink: Bool) {
        ctx.saveGState()
        // ears
        ctx.setFillColor(Palette.skinShade)
        for x in [40.2, 79.8] as [CGFloat] { ctx.fillEllipse(in: CGRect(x: x - 3, y: 111, width: 6, height: 10)) }
        // head
        let head = CGMutablePath()
        head.move(to: CGPoint(x: 60, y: 150))
        head.addCurve(to: CGPoint(x: 80.5, y: 122), control1: CGPoint(x: 74, y: 150), control2: CGPoint(x: 80.5, y: 138))
        head.addCurve(to: CGPoint(x: 60, y: 91.5), control1: CGPoint(x: 80.5, y: 105), control2: CGPoint(x: 72, y: 91.5))
        head.addCurve(to: CGPoint(x: 39.5, y: 122), control1: CGPoint(x: 48, y: 91.5), control2: CGPoint(x: 39.5, y: 105))
        head.addCurve(to: CGPoint(x: 60, y: 150), control1: CGPoint(x: 39.5, y: 138), control2: CGPoint(x: 46, y: 150))
        head.closeSubpath()
        ctx.saveGState()
        ctx.addPath(head); ctx.clip()
        let space = CGColorSpaceCreateDeviceRGB()
        if let g = CGGradient(colorsSpace: space, colors: [rgb(0.98, 0.86, 0.78), Palette.skin, Palette.skinShade] as CFArray, locations: [0, 0.55, 1]) {
            ctx.drawRadialGradient(g, startCenter: CGPoint(x: 57, y: 124), startRadius: 2, endCenter: CGPoint(x: 60, y: 118), endRadius: 32, options: [.drawsAfterEndLocation])
        }
        // blush
        if f.blush > 0.01 {
            ctx.setFillColor(rgb(0.93, 0.32, 0.34, 0.55 * f.blush))
            for x in [46.0, 74.0] as [CGFloat] { ctx.fillEllipse(in: CGRect(x: x - 5.5, y: 103, width: 11, height: 7)) }
        }
        drawHair(ctx)
        ctx.restoreGState()
        drawEyes(ctx, f, blink: blink)
        drawBrows(ctx, f)
        drawNoseAndMouth(ctx, f)
        ctx.restoreGState()
    }

    private static func drawHair(_ ctx: CGContext) {
        let hair = CGMutablePath()
        hair.move(to: CGPoint(x: 38, y: 124))
        hair.addCurve(to: CGPoint(x: 60, y: 156), control1: CGPoint(x: 36, y: 146), control2: CGPoint(x: 46, y: 156))
        hair.addCurve(to: CGPoint(x: 82, y: 124), control1: CGPoint(x: 76, y: 156), control2: CGPoint(x: 84, y: 146))
        hair.addCurve(to: CGPoint(x: 79, y: 129), control1: CGPoint(x: 82, y: 126), control2: CGPoint(x: 80.5, y: 128))
        // fringe, swept to the right
        hair.addCurve(to: CGPoint(x: 66, y: 139), control1: CGPoint(x: 76, y: 131), control2: CGPoint(x: 72, y: 140))
        hair.addCurve(to: CGPoint(x: 52, y: 137), control1: CGPoint(x: 61, y: 140), control2: CGPoint(x: 56, y: 140.5))
        hair.addCurve(to: CGPoint(x: 41, y: 128), control1: CGPoint(x: 47, y: 135), control2: CGPoint(x: 42, y: 133))
        hair.addCurve(to: CGPoint(x: 38, y: 124), control1: CGPoint(x: 40, y: 127), control2: CGPoint(x: 38.5, y: 125))
        hair.closeSubpath()
        ctx.setFillColor(Palette.hair); ctx.addPath(hair); ctx.fillPath()
        ctx.setStrokeColor(Palette.hairLight.copy(alpha: 0.7)!); ctx.setLineWidth(0.8)
        for (a, b) in [((46.0, 147.0), (58.0, 150.0)), ((54.0, 144.0), (68.0, 146.0)), ((66.0, 148.0), (75.0, 142.0))] as [((CGFloat, CGFloat), (CGFloat, CGFloat))] {
            ctx.move(to: CGPoint(x: a.0, y: a.1)); ctx.addQuadCurve(to: CGPoint(x: b.0, y: b.1), control: CGPoint(x: (a.0 + b.0) / 2, y: (a.1 + b.1) / 2 + 2)); ctx.strokePath()
        }
    }

    private static func drawEyes(_ ctx: CGContext, _ f: Face, blink: Bool) {
        let open = blink ? 0.04 : f.eyeOpen * (1 - 0.92 * f.squint)
        for dx in [-9.0, 9.0] as [CGFloat] {
            ctx.saveGState()
            ctx.translateBy(x: cx + dx, y: 118.5)
            let w: CGFloat = 4.6
            if open < 0.14 {
                let arc: CGFloat = f.smile > 0.45 ? 1.8 : -1.6      // happy ^ or sleepy U
                ctx.setStrokeColor(Palette.ink); ctx.setLineWidth(1.2); ctx.setLineCap(.round)
                ctx.move(to: CGPoint(x: -w, y: 0)); ctx.addQuadCurve(to: CGPoint(x: w, y: 0), control: CGPoint(x: 0, y: arc * 1.6)); ctx.strokePath()
            } else {
                let top = 3.0 * open, bottom = 1.8 * open
                let eye = CGMutablePath()
                eye.move(to: CGPoint(x: -w, y: 0))
                eye.addCurve(to: CGPoint(x: w, y: 0), control1: CGPoint(x: -w * 0.5, y: top * 1.45), control2: CGPoint(x: w * 0.5, y: top * 1.45))
                eye.addCurve(to: CGPoint(x: -w, y: 0), control1: CGPoint(x: w * 0.5, y: -bottom * 1.4), control2: CGPoint(x: -w * 0.5, y: -bottom * 1.4))
                ctx.setFillColor(rgb(0.96, 0.95, 0.94)); ctx.addPath(eye); ctx.fillPath()
                ctx.saveGState(); ctx.addPath(eye); ctx.clip()
                let ic = CGPoint(x: f.gaze.x * 1.8, y: f.gaze.y * 0.9 + 0.2)
                ctx.setFillColor(rgb(0.30, 0.24, 0.20)); ctx.fillEllipse(in: CGRect(x: ic.x - 2.3, y: ic.y - 2.3, width: 4.6, height: 4.6))
                ctx.setFillColor(rgb(0.04, 0.03, 0.03)); ctx.fillEllipse(in: CGRect(x: ic.x - 1.15, y: ic.y - 1.15, width: 2.3, height: 2.3))
                ctx.setFillColor(rgb(1, 1, 1, 0.9)); ctx.fillEllipse(in: CGRect(x: ic.x + 0.4, y: ic.y + 0.5, width: 0.9, height: 0.9))
                ctx.restoreGState()
                ctx.setStrokeColor(Palette.ink); ctx.setLineWidth(1.0); ctx.setLineCap(.round)
                ctx.move(to: CGPoint(x: -w, y: 0)); ctx.addCurve(to: CGPoint(x: w, y: 0), control1: CGPoint(x: -w * 0.5, y: top * 1.45), control2: CGPoint(x: w * 0.5, y: top * 1.45)); ctx.strokePath()
                ctx.setStrokeColor(rgb(0.55, 0.36, 0.34, 0.45)); ctx.setLineWidth(0.7)
                ctx.move(to: CGPoint(x: -w + 0.5, y: -2.4 * open - 0.6)); ctx.addQuadCurve(to: CGPoint(x: w - 0.5, y: -2.4 * open - 0.6), control: CGPoint(x: 0, y: -3.8 * open - 1.2)); ctx.strokePath()
            }
            ctx.restoreGState()
        }
    }

    private static func drawBrows(_ ctx: CGContext, _ f: Face) {
        ctx.setStrokeColor(Palette.hair); ctx.setLineWidth(2.1); ctx.setLineCap(.round)
        let lift = 125.2 + f.brow * 3.4
        for side in [-1.0, 1.0] as [CGFloat] {
            let outer = CGPoint(x: cx + side * 14.5, y: lift - f.browTilt * -1.2 + (f.brow < 0 ? 0 : 0.4))
            let inner = CGPoint(x: cx + side * 4.5, y: lift - f.browTilt * 2.6)
            ctx.move(to: outer); ctx.addQuadCurve(to: inner, control: CGPoint(x: cx + side * 9.5, y: lift + 1.8 - f.browTilt * 1.2)); ctx.strokePath()
        }
    }

    private static func drawNoseAndMouth(_ ctx: CGContext, _ f: Face) {
        // nose
        ctx.setStrokeColor(rgb(0.62, 0.40, 0.36, 0.7)); ctx.setLineWidth(0.9); ctx.setLineCap(.round)
        ctx.move(to: CGPoint(x: cx - 3.4, y: 107.6)); ctx.addQuadCurve(to: CGPoint(x: cx + 3.4, y: 107.6), control: CGPoint(x: cx, y: 104.6)); ctx.strokePath()
        ctx.setStrokeColor(rgb(0.62, 0.40, 0.36, 0.35)); ctx.setLineWidth(0.8)
        ctx.move(to: CGPoint(x: cx - 1.6, y: 116)); ctx.addLine(to: CGPoint(x: cx - 2.4, y: 108.5)); ctx.strokePath()
        ctx.setFillColor(rgb(0.45, 0.26, 0.24, 0.55))
        for x in [-2.2, 2.2] as [CGFloat] { ctx.fillEllipse(in: CGRect(x: cx + x - 0.8, y: 106.2, width: 1.6, height: 1.1)) }
        // mouth
        let my: CGFloat = 98.5 + (f.smile < 0 ? 0 : 0)
        let half: CGFloat = 5.2 + f.mouthOpen * 1.2 + max(0, f.smile) * 1.6
        if f.mouthOpen > 0.08 {
            let h = 1 + f.mouthOpen * 5.2
            let mouth = CGRect(x: cx - half, y: my - h * 0.6, width: half * 2, height: h)
            ctx.setFillColor(rgb(0.30, 0.06, 0.08)); ctx.fillEllipse(in: mouth)
            ctx.saveGState(); ctx.addEllipse(in: mouth); ctx.clip()
            if f.mouthOpen > 0.35 { ctx.setFillColor(rgb(0.97, 0.95, 0.92)); ctx.fill(CGRect(x: cx - half, y: mouth.maxY - 1.6, width: half * 2, height: 1.6)) }
            ctx.setFillColor(rgb(0.86, 0.36, 0.40)); ctx.fillEllipse(in: CGRect(x: cx - half * 0.6, y: mouth.minY - h * 0.25, width: half * 1.2, height: h * 0.55))
            ctx.restoreGState()
            ctx.setStrokeColor(rgb(0.55, 0.28, 0.28)); ctx.setLineWidth(0.8); ctx.strokeEllipse(in: mouth)
        } else {
            let curve = f.smile * 3.0
            // lower lip
            ctx.setFillColor(rgb(0.86, 0.55, 0.55)); ctx.fillEllipse(in: CGRect(x: cx - 4.4, y: my - 3.1 + curve * 0.2, width: 8.8, height: 2.7))
            ctx.setStrokeColor(rgb(0.46, 0.20, 0.22)); ctx.setLineWidth(1.0); ctx.setLineCap(.round)
            ctx.move(to: CGPoint(x: cx - half, y: my + curve * 0.4 - (f.smile < 0 ? 0.8 * -f.smile : 0)))
            ctx.addQuadCurve(to: CGPoint(x: cx + half, y: my + curve * 0.4 - (f.smile < 0 ? 0.8 * -f.smile : 0)), control: CGPoint(x: cx, y: my - curve - 0.4))
            ctx.strokePath()
        }
        // chin dimple
        ctx.setStrokeColor(rgb(0.7, 0.5, 0.45, 0.3)); ctx.setLineWidth(0.7)
        ctx.move(to: CGPoint(x: cx - 2, y: 93.8)); ctx.addQuadCurve(to: CGPoint(x: cx + 2, y: 93.8), control: CGPoint(x: cx, y: 92.6)); ctx.strokePath()
    }

    // MARK: Label

    private static func labelFont(_ size: CGFloat) -> NSFont {
        NSFont(name: "Impact", size: size) ?? NSFont(name: "HelveticaNeue-CondensedBlack", size: size) ?? .systemFont(ofSize: size, weight: .black)
    }

    /// Draws `text` stretched to fill `rect` as exactly as the font allows.
    static func drawFitted(_ text: String, rect: CGRect, color: CGColor, font: (CGFloat) -> NSFont = labelFont) {
        let probe: CGFloat = 20
        let attrs: [NSAttributedString.Key: Any] = [.font: font(probe), .foregroundColor: NSColor(cgColor: color) ?? .black]
        let size = NSAttributedString(string: text, attributes: attrs).size()
        let k = min(rect.width / size.width, rect.height / (size.height * 0.78))
        let fitted = NSAttributedString(string: text, attributes: [.font: font(probe * k), .foregroundColor: NSColor(cgColor: color) ?? .black])
        let s = fitted.size()
        fitted.draw(at: CGPoint(x: rect.midX - s.width / 2, y: rect.midY - s.height * 0.5 - s.height * 0.04))
    }

    static func drawLabel(_ ctx: CGContext) {
        let r = CGRect(x: 28, y: 39, width: 64, height: 43)
        ctx.setFillColor(Palette.paper); ctx.fill(r)
        ctx.setStrokeColor(rgb(0.30, 0.33, 0.42)); ctx.setLineWidth(1)
        ctx.stroke(r.insetBy(dx: 0.5, dy: 0.5))
        // ornament columns on both sides
        ctx.setStrokeColor(rgb(0.45, 0.48, 0.55, 0.9)); ctx.setLineWidth(0.5)
        var y = r.minY + 2
        while y < r.maxY - 2 {
            for x in [r.minX + 1.8, r.minX + 3.4, r.maxX - 1.8, r.maxX - 3.4] { ctx.move(to: CGPoint(x: x, y: y)); ctx.addLine(to: CGPoint(x: x, y: y + 0.9)) }
            y += 1.7
        }
        ctx.strokePath()
        ctx.setStrokeColor(rgb(0.45, 0.48, 0.55)); ctx.setLineWidth(0.5)
        ctx.stroke(r.insetBy(dx: 5.4, dy: 1.8))

        drawFitted("ЧЕКУШКА", rect: CGRect(x: 33, y: 66, width: 54, height: 12), color: Palette.labelBlue)
        drawFitted("МИРОВАЯ", rect: CGRect(x: 33.5, y: 57.5, width: 27, height: 6.5), color: Palette.labelRed)
        drawFitted("№67", rect: CGRect(x: 62, y: 45.5, width: 25, height: 17), color: Palette.labelBlue)
        // fine print
        ctx.setStrokeColor(rgb(0.45, 0.45, 0.5, 0.8)); ctx.setLineWidth(0.5)
        let widths: [CGFloat] = [24, 26, 22, 25, 17]
        for (i, w) in widths.enumerated() {
            let yy = 54.6 - CGFloat(i) * 1.7
            ctx.move(to: CGPoint(x: 33.5, y: yy)); ctx.addLine(to: CGPoint(x: 33.5 + w, y: yy))
        }
        ctx.strokePath()
        // bottom strip: excise stamps
        ctx.setFillColor(rgb(0.90, 0.88, 0.88)); ctx.fill(CGRect(x: 33, y: 40.6, width: 24, height: 3.2))
        ctx.setStrokeColor(rgb(0.45, 0.30, 0.30)); ctx.setLineWidth(0.4); ctx.stroke(CGRect(x: 33, y: 40.6, width: 24, height: 3.2))
        ctx.setFillColor(Palette.labelRed); ctx.fillEllipse(in: CGRect(x: 59, y: 40.3, width: 3.6, height: 3.6))
        ctx.setFillColor(rgb(0.8, 0.8, 0.84)); ctx.fill(CGRect(x: 64, y: 40.6, width: 12, height: 3.2))
    }

    // MARK: Cap and neck label (drawn over the glass)

    static func drawNeckAndCap(_ ctx: CGContext) {
        // blue neck label
        let band = CGMutablePath()
        band.move(to: CGPoint(x: cx - 12, y: 165.5))
        band.addLine(to: CGPoint(x: cx + 12, y: 165.5))
        band.addLine(to: CGPoint(x: cx + 12, y: 155.5))
        band.addQuadCurve(to: CGPoint(x: cx - 12, y: 155.5), control: CGPoint(x: cx, y: 153))
        band.closeSubpath()
        ctx.setFillColor(rgb(0.10, 0.15, 0.62)); ctx.addPath(band); ctx.fillPath()
        ctx.setStrokeColor(rgb(0.78, 0.82, 0.95, 0.9)); ctx.setLineWidth(0.5); ctx.addPath(band); ctx.strokePath()
        drawFitted("ЧЕКУШКА", rect: CGRect(x: cx - 9.5, y: 157.2, width: 19, height: 5), color: rgb(0.95, 0.96, 1), font: { .systemFont(ofSize: $0, weight: .heavy) })
        // cap
        let capRect = CGRect(x: cx - 11.5, y: 166, width: 23, height: 14)
        let cap = CGPath(roundedRect: capRect, cornerWidth: 3, cornerHeight: 3, transform: nil)
        ctx.saveGState(); ctx.addPath(cap); ctx.clip()
        let space = CGColorSpaceCreateDeviceRGB()
        if let g = CGGradient(colorsSpace: space, colors: [rgb(0.55, 0.60, 0.66), rgb(0.93, 0.95, 0.97), rgb(0.72, 0.76, 0.81), rgb(0.50, 0.55, 0.62)] as CFArray, locations: [0, 0.3, 0.7, 1]) {
            ctx.drawLinearGradient(g, start: CGPoint(x: capRect.minX, y: 0), end: CGPoint(x: capRect.maxX, y: 0), options: [])
        }
        ctx.setStrokeColor(rgb(0.35, 0.40, 0.46, 0.5)); ctx.setLineWidth(0.5)
        var x = capRect.minX + 1.4
        while x < capRect.maxX { ctx.move(to: CGPoint(x: x, y: capRect.minY + 1)); ctx.addLine(to: CGPoint(x: x, y: capRect.maxY - 1)); x += 1.7 }
        ctx.strokePath()
        ctx.setFillColor(rgb(1, 1, 1, 0.5)); ctx.fill(CGRect(x: capRect.minX + 3, y: capRect.maxY - 3, width: 17, height: 1.4))
        ctx.restoreGState()
        ctx.setStrokeColor(rgb(0.25, 0.30, 0.36, 0.8)); ctx.setLineWidth(0.8); ctx.addPath(cap); ctx.strokePath()
        ctx.setStrokeColor(rgb(0.25, 0.30, 0.36, 0.7)); ctx.setLineWidth(0.6)
        ctx.move(to: CGPoint(x: capRect.minX, y: 168.5)); ctx.addLine(to: CGPoint(x: capRect.maxX, y: 168.5)); ctx.strokePath()
    }

    /// Reflections and outline on top of everything inside.
    static func drawGlassFront(_ ctx: CGContext) {
        ctx.saveGState()
        ctx.addPath(bottlePath()); ctx.clip()
        let space = CGColorSpaceCreateDeviceRGB()
        if let g = CGGradient(colorsSpace: space, colors: [rgb(0.8, 0.9, 0.95, 0.40), rgb(1, 1, 1, 0.0), rgb(1, 1, 1, 0.0), rgb(0.75, 0.86, 0.92, 0.35)] as CFArray, locations: [0, 0.14, 0.82, 1]) {
            ctx.drawLinearGradient(g, start: CGPoint(x: cx - 34, y: 0), end: CGPoint(x: cx + 34, y: 0), options: [])
        }
        // long highlight on the left
        ctx.setStrokeColor(rgb(1, 1, 1, 0.55)); ctx.setLineWidth(2.4); ctx.setLineCap(.round)
        ctx.move(to: CGPoint(x: cx - 29.5, y: 104)); ctx.addLine(to: CGPoint(x: cx - 29.5, y: 40)); ctx.strokePath()
        ctx.setLineWidth(1.5)
        ctx.move(to: CGPoint(x: cx - 7.5, y: 150)); ctx.addCurve(to: CGPoint(x: cx - 27, y: 118), control1: CGPoint(x: cx - 8, y: 138), control2: CGPoint(x: cx - 22, y: 132)); ctx.strokePath()
        // soft right edge light
        ctx.setStrokeColor(rgb(1, 1, 1, 0.35)); ctx.setLineWidth(1.2)
        ctx.move(to: CGPoint(x: cx + 29.5, y: 100)); ctx.addLine(to: CGPoint(x: cx + 29.5, y: 46)); ctx.strokePath()
        ctx.move(to: CGPoint(x: cx + 8, y: 150)); ctx.addCurve(to: CGPoint(x: cx + 26, y: 122), control1: CGPoint(x: cx + 9, y: 140), control2: CGPoint(x: cx + 22, y: 134)); ctx.strokePath()
        // glare on the base
        ctx.setFillColor(rgb(1, 1, 1, 0.5)); ctx.fillEllipse(in: CGRect(x: cx - 24, y: 23.5, width: 14, height: 3))
        ctx.restoreGState()
        ctx.setStrokeColor(Palette.outline); ctx.setLineWidth(1.1); ctx.addPath(bottlePath()); ctx.strokePath()
    }
}
