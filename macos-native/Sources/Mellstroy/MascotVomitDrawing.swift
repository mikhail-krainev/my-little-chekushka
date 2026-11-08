import CoreGraphics

/// Pixel-art vomit: chunks flying from the mouth into a puddle on the floor.
enum MascotVomitDrawing {
    private static let chunkInterval: CGFloat = 0.022         // seconds between chunks leaving the mouth
    private static let flightTime: CGFloat = 0.5
    private static let puddleHalfWidth: CGFloat = 21
    private static let puddleHalfHeight: CGFloat = 3.6
    private static let puddleGrowDelay: CGFloat = 0.35
    private static let floorY: CGFloat = 1.5
    private static let landingAhead: CGFloat = 45             // puddle distance in front of the feet

    private struct Palette {
        var dark, base, light: CGColor
    }

    private static let vodkaPalette = Palette(dark: rgb(0.55, 0.58, 0.24), base: rgb(0.76, 0.79, 0.42), light: rgb(0.93, 0.95, 0.66))
    private static let beerPalette = Palette(dark: rgb(0.58, 0.40, 0.08), base: rgb(0.85, 0.66, 0.20), light: rgb(0.98, 0.90, 0.58))

    /// Cheap deterministic noise in 0...1 so the stream does not flicker between frames.
    private static func noise(_ i: Int, _ salt: Int) -> CGFloat {
        let v = sin(Double(i &* 127 &+ salt &* 311) * 12.9898) * 43758.5453
        return CGFloat(v - floor(v))
    }

    static func draw(_ ctx: CGContext, _ v: Vomit, mouth: CGPoint, puddleX: CGFloat) {
        let pal = v.isBeer ? beerPalette : vodkaPalette
        let alpha = 1 - v.fade
        guard alpha > 0.01 else { return }
        let landX = puddleX + v.side * landingAhead
        drawPuddle(ctx, v, pal, centreX: landX, alpha: alpha)
        let count = Int(v.flowEnd / chunkInterval) + 1
        for i in 0..<count {
            let age = v.elapsed - CGFloat(i) * chunkInterval
            guard age > 0, age < flightTime else { continue }
            let u = age / flightTime
            let target = CGPoint(x: landX + (noise(i, 1) - 0.5) * puddleHalfWidth, y: floorY)
            let wobble = (noise(i, 2) - 0.5) * 3
            let p = CGPoint(x: lerp(mouth.x, target.x, u) + wobble * (1 - u), y: lerp(mouth.y - 1, target.y, u * u) + wobble * 0.6)
            let tone = noise(i, 3)
            let color = tone < 0.25 ? pal.dark : (tone > 0.7 ? pal.light : pal.base)
            PixelFX.block(ctx, at: p, cells: noise(i, 4) > 0.5 ? 3 : 2, color: color.copy(alpha: alpha) ?? color)
        }
    }

    private static func drawPuddle(_ ctx: CGContext, _ v: Vomit, _ pal: Palette, centreX: CGFloat, alpha: CGFloat) {
        let grow = min(1, max(0, (v.elapsed - puddleGrowDelay) / max(0.1, v.flowEnd)))
        guard grow > 0.02 else { return }
        let c = CGPoint(x: centreX, y: floorY)
        let eased = sqrt(grow)
        PixelFX.ellipse(ctx, center: c, rx: puddleHalfWidth * eased, ry: puddleHalfHeight * eased, color: (pal.dark.copy(alpha: alpha) ?? pal.dark))
        PixelFX.ellipse(ctx, center: CGPoint(x: c.x, y: c.y + 0.4), rx: puddleHalfWidth * eased * 0.8, ry: puddleHalfHeight * eased * 0.65, color: (pal.base.copy(alpha: alpha) ?? pal.base))
        // a few lumps and a shine
        let light = pal.light.copy(alpha: alpha) ?? pal.light
        for (dx, dy) in [(-0.45, 0.1), (0.1, -0.2), (0.5, 0.15)] as [(CGFloat, CGFloat)] where eased > 0.5 {
            PixelFX.block(ctx, at: CGPoint(x: c.x + dx * puddleHalfWidth * eased, y: c.y + dy * puddleHalfHeight), cells: 1, color: light)
        }
    }
}
