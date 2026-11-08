import CoreGraphics

/// Pixel-art helpers. Everything extra (arms, bottles, smoke, glass, spit) is snapped to a grid of art pixels,
/// the same grid the sprites cut from the reference use, so it matches the mascot.
enum PixelFX {
    /// One art pixel in sprite units (3 reference px per art pixel).
    static let cell: CGFloat = 3 * RefMap.scale
    /// Grid origin of the body sprites, so drawn parts line up with the photo pixels.
    static let bodyGrid = RefMap.point(0, 0)

    /// Fills every grid cell inside `bounds` whose centre satisfies `inside`. Runs in one row become one rect.
    static func fill(_ ctx: CGContext, bounds: CGRect, cell: CGFloat = PixelFX.cell, origin: CGPoint = .zero,
                     color: CGColor, inside: (CGPoint) -> Bool) {
        guard bounds.width > 0, bounds.height > 0, cell > 0 else { return }
        ctx.setFillColor(color)
        let x0 = Int(floor((bounds.minX - origin.x) / cell)), x1 = Int(ceil((bounds.maxX - origin.x) / cell))
        let y0 = Int(floor((bounds.minY - origin.y) / cell)), y1 = Int(ceil((bounds.maxY - origin.y) / cell))
        for iy in y0..<y1 {
            var runStart: Int?
            for ix in x0...x1 {                                         // x1 is a sentinel that flushes the last run
                let hit = ix < x1 && inside(CGPoint(x: origin.x + (CGFloat(ix) + 0.5) * cell, y: origin.y + (CGFloat(iy) + 0.5) * cell))
                if hit {
                    if runStart == nil { runStart = ix }
                } else if let start = runStart {
                    ctx.fill(CGRect(x: origin.x + CGFloat(start) * cell, y: origin.y + CGFloat(iy) * cell,
                                    width: CGFloat(ix - start) * cell, height: cell))
                    runStart = nil
                }
            }
        }
    }

    static func ellipse(_ ctx: CGContext, center c: CGPoint, rx: CGFloat, ry: CGFloat, cell: CGFloat = PixelFX.cell,
                        origin: CGPoint = .zero, color: CGColor) {
        guard rx > 0, ry > 0 else { return }
        let bounds = CGRect(x: c.x - rx, y: c.y - ry, width: 2 * rx, height: 2 * ry)
        fill(ctx, bounds: bounds, cell: cell, origin: origin, color: color) { p in
            let dx = (p.x - c.x) / rx, dy = (p.y - c.y) / ry
            return dx * dx + dy * dy <= 1
        }
    }

    static func disc(_ ctx: CGContext, center c: CGPoint, radius: CGFloat, cell: CGFloat = PixelFX.cell, color: CGColor) {
        ellipse(ctx, center: c, rx: radius, ry: radius, cell: cell, color: color)
    }

    /// One art pixel block at the grid cell that contains `p`.
    static func block(_ ctx: CGContext, at p: CGPoint, cells: Int = 1, cell: CGFloat = PixelFX.cell, color: CGColor) {
        let side = CGFloat(cells) * cell
        ctx.setFillColor(color)
        ctx.fill(CGRect(x: floor(p.x / cell) * cell, y: floor(p.y / cell) * cell, width: side, height: side))
    }

    /// Draws a small bitmap (rows top to bottom, `X` = filled) with its top-left corner snapped to the grid.
    static func bitmap(_ ctx: CGContext, rows: [String], topLeft p: CGPoint, scale: Int = 1, cell: CGFloat = PixelFX.cell, color: CGColor) {
        ctx.setFillColor(color)
        let unit = cell * CGFloat(scale)
        let left = (p.x / cell).rounded() * cell, top = (p.y / cell).rounded() * cell
        for (row, line) in rows.enumerated() {
            for (col, ch) in line.enumerated() where ch == "X" {
                ctx.fill(CGRect(x: left + CGFloat(col) * unit, y: top - CGFloat(row + 1) * unit, width: unit, height: unit))
            }
        }
    }

    /// Polygon rasterised on the grid of the current coordinate system.
    static func polygon(_ ctx: CGContext, points: [CGPoint], cell: CGFloat, color: CGColor) {
        guard let first = points.first else { return }
        let path = CGMutablePath()
        path.move(to: first)
        points.dropFirst().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        fill(ctx, bounds: path.boundingBox.insetBy(dx: -cell, dy: -cell), cell: cell, color: color) { path.contains($0) }
    }
}
