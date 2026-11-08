import AppKit

/// Developer tool: `swift run Mellstroy --sheet out.png [basic|drink|beer|stretch|spit|vomit|shards]` renders poses to a PNG
/// so animation and drawing can be checked without launching the desktop pet.
enum PoseSheet {
    private static let cellSize = CGSize(width: 260, height: 270)
    private static let scale: CGFloat = 1.25

    static func runIfRequested(_ args: [String]) -> Bool {
        guard let i = args.firstIndex(of: "--sheet"), i + 1 < args.count else { return false }
        let set = i + 2 < args.count ? args[i + 2] : "basic"
        if set == "shards" { renderShards(to: args[i + 1]); return true }
        let entries = poses(for: set)
        render(entries, columns: 4, to: args[i + 1])
        return true
    }

    private static func poses(for set: String) -> [(String, MascotPose)] {
        let base = Face()
        switch set {
        case "spit":
            return [0.3, 0.7, 1.1, 1.7, 2.0, MascotAnimator.spitRelease + 0.1, 2.5, 2.9].map { t in
                ("spit \(t)", MascotAnimator.performance(Performance(kind: .spit, duration: MascotAnimator.spitDuration, side: 1), time: CGFloat(t), base: base))
            }
        case "vomit":
            let tl = MascotAnimator.drinkTimeline(.beer, vomits: true)
            let times: [CGFloat] = [tl.swayEnd + 0.3, tl.swayEnd + 0.9, tl.swayEnd + 1.3, tl.swayEnd + 1.9, tl.swayEnd + 2.7, tl.swayEnd + 3.2, tl.windupEnd - 0.1, tl.release]
            return times.map { t in
                ("vomit \(Int((t - tl.swayEnd) * 100))", MascotAnimator.performance(Performance(kind: .beer, duration: tl.end, side: 1, vomits: true), time: t, base: base))
            }
        case "stretch":
            return [0.5, 1.5, 2.3, 4.0, 5.0, 7.0, 9.0, 11.0].map { t in
                ("stretch \(t)", MascotAnimator.performance(Performance(kind: .stretch, duration: MascotAnimator.stretchDuration, side: 1), time: CGFloat(t), base: base))
            }
        case "drink":
            let kind = Performance.Kind.vodka
            let times: [CGFloat] = [0.4, 1.0, 1.6, 2.2, 3.2, 5.0, 5.8, 6.6, 7.3, 8.0, 8.3, 9.0]
            return times.map { t in
                (" vodka \(t)", MascotAnimator.performance(Performance(kind: kind, duration: MascotAnimator.drinkTimeline(.vodka).end, side: 1), time: t, base: base))
            }
        case "beer":
            let tl = MascotAnimator.drinkTimeline(.beer)
            let times: [CGFloat] = [1.0, 1.7, 2.1, 3.5, 5.5, tl.lowerEnd, tl.lowerEnd + 0.8, tl.swayEnd - 0.2, tl.windupEnd - 0.1, tl.release]
            return times.map { t in
                ("beer \(t)", MascotAnimator.performance(Performance(kind: .beer, duration: tl.end, side: -1), time: t, base: base))
            }
        default:
            let sit = Performance(kind: .sit, duration: 6, side: 1), sleep = Performance(kind: .sleep, duration: 12, side: 1)
            return [
                ("idle", MascotAnimator.idle(time: 0, base: base)),
                ("walk 0.6", MascotAnimator.walk(phase: 0.6, dir: 1, run: false, base: base)),
                ("run 1.2", MascotAnimator.walk(phase: 1.2, dir: -1, run: true, base: base)),
                ("crouch", MascotAnimator.crouch(progress: 1, dir: 1, base: base)),
                ("air up", MascotAnimator.airborne(progress: 0.25, dir: 1, base: base)),
                ("air down", MascotAnimator.airborne(progress: 0.75, dir: 1, base: base)),
                ("sit", MascotAnimator.performance(sit, time: 3, base: base)),
                ("sit yawn", MascotAnimator.performance(sit, time: 2.0, base: base)),
                ("sleep fall", MascotAnimator.performance(sleep, time: 1.2, base: base)),
                ("sleep", MascotAnimator.performance(sleep, time: 5, base: base)),
                ("hang", MascotAnimator.hanging(time: 0, swing: 0.3, base: base)),
                ("flung", MascotAnimator.flung(time: 0.2, velocityX: 600, base: base)),
            ]
        }
    }

    private static func render(_ entries: [(String, MascotPose)], columns: Int, to path: String) {
        let rows = (entries.count + columns - 1) / columns
        let w = Int(cellSize.width * CGFloat(columns)), h = Int(cellSize.height * CGFloat(rows))
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                                         hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let gctx = NSGraphicsContext(bitmapImageRep: rep) else { print("cannot create bitmap"); return }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = gctx
        let ctx = gctx.cgContext
        ctx.setFillColor(rgb(0.80, 0.82, 0.86)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        for (i, entry) in entries.enumerated() {
            let col = i % columns, row = i / columns
            let origin = CGPoint(x: CGFloat(col) * cellSize.width, y: CGFloat(h) - CGFloat(row + 1) * cellSize.height)
            ctx.saveGState()
            ctx.translateBy(x: origin.x + 70, y: origin.y + 22)
            ctx.scaleBy(x: scale, y: scale)
            MascotRenderer.draw(entry.1, in: ctx)
            ctx.restoreGState()
            let label = NSAttributedString(string: entry.0, attributes: [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: NSColor.darkGray])
            label.draw(at: CGPoint(x: origin.x + 6, y: origin.y + cellSize.height - 18))
        }
        NSGraphicsContext.restoreGraphicsState()
        guard let data = rep.representation(using: .png, properties: [:]) else { print("png encode failed"); return }
        do { try data.write(to: URL(fileURLWithPath: path)); print("wrote \(path)") } catch { print("write failed: \(error)") }
    }

    /// Bottle in flight, then glass shortly after the impact, for both drinks.
    private static func renderShards(to path: String) {
        let size = CGSize(width: 900, height: 260)
        var strips: [NSBitmapImageRep] = []
        for kind in [PropKind.vodka, .beer] {
            for after in [-0.12, 0.25, 0.7] as [CGFloat] {
                var world = ShatterWorld(floor: 20, bounds: CGRect(origin: .zero, size: size), seed: 11)
                world.throwBottle(kind, from: CGPoint(x: 150, y: 130), velocity: CGVector(dx: 520, dy: 400))
                var clock: CGFloat = 0, impactAt: CGFloat?
                while clock < 3 {
                    world.step(1.0 / 120); clock += 1.0 / 120
                    if impactAt == nil, world.bottles.isEmpty { impactAt = clock }
                    if let hit = impactAt, clock >= hit + max(0, after) { break }
                    if after < 0, let hit = impactAt, clock >= hit { break }
                }
                if after < 0 {                      // frame shortly before the impact
                    world = ShatterWorld(floor: 20, bounds: CGRect(origin: .zero, size: size), seed: 11)
                    world.throwBottle(kind, from: CGPoint(x: 150, y: 130), velocity: CGVector(dx: 520, dy: 400))
                    for _ in 0..<Int(((impactAt ?? 0.5) + after) * 120) { world.step(1.0 / 120) }
                }
                let view = ShatterView(frame: CGRect(origin: .zero, size: size), world: world)
                guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { continue }
                view.cacheDisplay(in: view.bounds, to: rep)
                strips.append(rep)
            }
        }
        let w = Int(size.width), h = Int(size.height) * strips.count
        guard let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                         isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let gctx = NSGraphicsContext(bitmapImageRep: out) else { return }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = gctx
        gctx.cgContext.setFillColor(rgb(0.80, 0.82, 0.86)); gctx.cgContext.fill(CGRect(x: 0, y: 0, width: w, height: h))
        for (i, rep) in strips.enumerated() {
            rep.draw(in: CGRect(x: 0, y: CGFloat(h) - CGFloat(i + 1) * size.height, width: size.width, height: size.height))
        }
        NSGraphicsContext.restoreGraphicsState()
        if let data = out.representation(using: .png, properties: [:]) { try? data.write(to: URL(fileURLWithPath: path)); print("wrote \(path)") }
    }
}
