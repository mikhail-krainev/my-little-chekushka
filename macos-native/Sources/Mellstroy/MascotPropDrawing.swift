import CoreGraphics

/// Drinks the mascot holds and throws, drawn as pixel art on the same grid as the mascot.
/// Local coordinates: the gripped spot is the origin, the neck points up. Rows count from the bottom of the bottle.
enum MascotPropDrawing {
    private struct Shape {
        var rows: Int                       // including the cap
        var gripRow: Int                    // row of the bottle that sits in the hand
        var capRows: Int
        var maxHalf: Int                    // half width of the body, in cells
        var neckHalf: Int
        var shoulderStart: Int              // first row of the shoulder curve
        var shoulderEnd: Int                // first row of the neck
        var label: ClosedRange<Int>
        var textRow: Int                    // lowest row of the 5-row caption
        var caption: String

        var neckTop: Int { rows - capRows }
        var tipDistance: CGFloat { CGFloat(rows - gripRow) * PixelFX.cell }

        func halfWidth(_ r: Int) -> Int {
            guard (0..<rows).contains(r) else { return -1 }
            if r >= neckTop { return r == rows - 1 ? neckHalf : neckHalf + 1 }                       // cap
            if r == neckTop - 1 { return neckHalf + 1 }                                              // lip
            if r < 2 { return maxHalf - 2 + r }                                                      // rounded bottom
            if r < shoulderStart { return maxHalf }
            if r >= shoulderEnd { return neckHalf }
            let t = CGFloat(r - shoulderStart + 1) / CGFloat(shoulderEnd - shoulderStart + 1)
            return neckHalf + Int((CGFloat(maxHalf - neckHalf) * cos(t * .pi / 2)).rounded())
        }
    }

    // Drawn larger than life so they read on a small mascot.
    private static let vodka = Shape(rows: 43, gripRow: 12, capRows: 4, maxHalf: 10, neckHalf: 3, shoulderStart: 22, shoulderEnd: 31,
                                     label: 5...19, textRow: 9, caption: "ВОДКА")
    private static let beer = Shape(rows: 58, gripRow: 19, capRows: 3, maxHalf: 8, neckHalf: 3, shoulderStart: 28, shoulderEnd: 41,
                                    label: 8...26, textRow: 12, caption: "ПИВО")

    private static func shape(_ kind: PropKind) -> Shape { kind == .beer ? beer : vodka }

    /// Distance from the grip to the neck tip, used to put the bottle mouth on the mascot's mouth.
    static func tipDistance(_ kind: PropKind) -> CGFloat { shape(kind).tipDistance }

    // MARK: Palette

    private struct Colors {
        var outline, glassDark, glass, glassLight, liquidDark, liquid, liquidLight, foam: CGColor
        var capDark, cap, capLight, labelBase, labelBand, labelText: CGColor
    }

    private static let vodkaColors = Colors(
        outline: rgb(0.24, 0.34, 0.40), glassDark: rgb(0.58, 0.69, 0.75), glass: rgb(0.73, 0.83, 0.88), glassLight: rgb(0.90, 0.95, 0.97),
        liquidDark: rgb(0.70, 0.80, 0.88), liquid: rgb(0.83, 0.91, 0.96), liquidLight: rgb(0.95, 0.98, 1.0), foam: rgb(0.95, 0.98, 1.0),
        capDark: rgb(0.50, 0.54, 0.60), cap: rgb(0.78, 0.81, 0.86), capLight: rgb(0.93, 0.95, 0.98),
        labelBase: rgb(0.95, 0.95, 0.96), labelBand: Palette.labelRed, labelText: Palette.labelBlue)

    private static let beerColors = Colors(
        outline: rgb(0.10, 0.05, 0.02), glassDark: rgb(0.20, 0.10, 0.02), glass: rgb(0.34, 0.17, 0.04), glassLight: rgb(0.56, 0.32, 0.10),
        liquidDark: rgb(0.78, 0.46, 0.06), liquid: rgb(0.90, 0.58, 0.08), liquidLight: rgb(0.98, 0.72, 0.20), foam: rgb(0.99, 0.96, 0.86),
        capDark: rgb(0.62, 0.45, 0.08), cap: rgb(0.86, 0.68, 0.18), capLight: rgb(0.97, 0.85, 0.40),
        labelBase: rgb(0.96, 0.88, 0.58), labelBand: rgb(0.62, 0.10, 0.10), labelText: rgb(0.30, 0.10, 0.05))

    // MARK: Caption font (3 × 5 cells)

    private static let glyphs: [Character: [String]] = [
        "В": ["XX.", "X.X", "XX.", "X.X", "XX."],
        "О": [".X.", "X.X", "X.X", "X.X", ".X."],
        "Д": ["XXX", "X.X", "X.X", "XXX", "X.X"],
        "К": ["X.X", "XX.", "X..", "XX.", "X.X"],
        "А": [".X.", "X.X", "XXX", "X.X", "X.X"],
        "П": ["XXX", "X.X", "X.X", "X.X", "X.X"],
        "И": ["X.X", "X.X", "XXX", "X.X", "X.X"],
    ]

    private static func isCaptionPixel(_ caption: String, column: Int, row: Int) -> Bool {
        guard (0..<5).contains(row) else { return false }
        let letters = Array(caption)
        let width = letters.count * 4 - 1
        let x = column + width / 2
        guard x >= 0, x < width, x % 4 != 3, let glyph = glyphs[letters[x / 4]] else { return false }
        let line = Array(glyph[4 - row])                                     // row 0 is the bottom of the caption
        return line[x % 4] == "X"
    }

    // MARK: Drawing

    /// `angle` is the rotation already applied by the caller; it is undone for the liquid so its surface stays level.
    static func draw(_ ctx: CGContext, kind: PropKind, angle: CGFloat, fill: CGFloat, capOn: Bool) {
        let s = shape(kind), c = kind == .beer ? beerColors : vodkaColors
        let cell = PixelFX.cell
        let visibleRows = capOn ? s.rows : s.neckTop
        let liquidLevel = (fill * CGFloat(s.neckTop) * 0.70 - CGFloat(s.gripRow)) * cell
        let sinA = sin(angle), cosA = cos(angle)

        func isInside(_ i: Int, _ r: Int) -> Bool { r < visibleRows && abs(i) <= s.halfWidth(r) }
        func color(_ i: Int, _ r: Int) -> CGColor? {
            guard isInside(i, r) else { return nil }
            let hw = s.halfWidth(r), a = abs(i)
            let isCap = r >= s.neckTop
            if a == hw || r == 0 || r == visibleRows - 1 || !isInside(i, r - 1) || !isInside(i, r + 1) || a > s.halfWidth(r + 1) || a > s.halfWidth(r - 1) {
                return isCap ? c.capDark : c.outline
            }
            if isCap { return i < -hw + 2 ? c.capLight : (i > hw - 2 ? c.capDark : c.cap) }
            if s.label.contains(r) {
                let top = s.label.upperBound
                if r > top - 3 { return c.labelBand }
                let captionRow = r - s.textRow
                if isCaptionPixel(s.caption, column: i, row: captionRow) { return c.labelText }
                return c.labelBase
            }
            let local = CGPoint(x: CGFloat(i) * cell, y: (CGFloat(r) + 0.5 - CGFloat(s.gripRow)) * cell)
            let height = local.x * sinA + local.y * cosA                      // height above the grip once the bottle is rotated back upright
            let isLiquid = fill > 0.01 && height < liquidLevel
            if isLiquid {
                if height > liquidLevel - cell { return c.foam }
                return i < -hw + 3 ? c.liquidLight : (i > hw - 3 ? c.liquidDark : c.liquid)
            }
            return i < -hw + 3 ? c.glassLight : (i > hw - 3 ? c.glassDark : c.glass)
        }

        ctx.saveGState()
        for r in 0..<visibleRows {
            var runStart: Int?, runColor: CGColor?
            func flush(upTo end: Int) {
                guard let start = runStart, let col = runColor else { return }
                ctx.setFillColor(col)
                ctx.fill(CGRect(x: (CGFloat(start) - 0.5) * cell, y: CGFloat(r - s.gripRow) * cell, width: CGFloat(end - start) * cell, height: cell))
            }
            for i in -s.maxHalf...(s.maxHalf + 1) {
                let col = i <= s.maxHalf ? color(i, r) : nil
                if let col, let current = runColor, col == current { continue }
                flush(upTo: i)
                runStart = col == nil ? nil : i
                runColor = col
            }
        }
        ctx.restoreGState()
    }

    /// Small bottle cap used for the "pop" effect.
    static func drawCap(_ ctx: CGContext, kind: PropKind) {
        let c = kind == .beer ? beerColors : vodkaColors
        let cell = PixelFX.cell
        ctx.setFillColor(c.cap); ctx.fill(CGRect(x: -2.5 * cell, y: 0, width: 5 * cell, height: cell))
        ctx.setFillColor(c.capDark); ctx.fill(CGRect(x: -2.5 * cell, y: -cell, width: 5 * cell, height: cell))
        ctx.setFillColor(c.capLight); ctx.fill(CGRect(x: -2.5 * cell, y: 0, width: 2 * cell, height: cell))
    }
}
