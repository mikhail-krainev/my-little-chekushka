import AppKit

/// Click-through full-screen layer that shows the thrown bottle, the broken glass and spit on the screen.
final class ShatterView: NSView {
    var world: ShatterWorld
    init(frame: CGRect, world: ShatterWorld) { self.world = world; super.init(frame: frame) }
    required init?(coder: NSCoder) { fatalError("not used") }
    override var isFlipped: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setShouldAntialias(false)
        for d in world.droplets { drawDroplet(ctx, d) }
        for s in world.shards { drawShard(ctx, s) }
        for splat in world.splats { drawSplat(ctx, splat) }
        for glob in world.spits { drawGlob(ctx, glob) }
        for b in world.bottles {
            ctx.saveGState()
            ctx.translateBy(x: b.pos.x, y: b.pos.y)
            ctx.rotate(by: b.angle)
            ctx.scaleBy(x: Config.spriteScale, y: Config.spriteScale)
            MascotPropDrawing.draw(ctx, kind: b.kind, angle: 0, fill: 0, capOn: false)
            ctx.restoreGState()
        }
    }

    private static let pixel = Config.pixelSize

    private func drawShard(_ ctx: CGContext, _ s: Shard) {
        guard s.points.count > 2 else { return }
        let a = s.alpha, beer = s.kind == .beer
        ctx.saveGState()
        ctx.translateBy(x: s.pos.x, y: s.pos.y)
        ctx.rotate(by: s.angle)
        let px = Self.pixel
        // dark rim, glass body, bright inner edge: three nested pixel polygons
        let centre = CGPoint(x: s.points.reduce(0) { $0 + $1.x } / CGFloat(s.points.count), y: s.points.reduce(0) { $0 + $1.y } / CGFloat(s.points.count))
        func shrunk(_ k: CGFloat) -> [CGPoint] { s.points.map { CGPoint(x: centre.x + ($0.x - centre.x) * k, y: centre.y + ($0.y - centre.y) * k) } }
        PixelFX.polygon(ctx, points: s.points, cell: px, color: beer ? rgb(0.25, 0.12, 0.03, 0.9 * a) : rgb(0.22, 0.38, 0.48, 0.9 * a))
        PixelFX.polygon(ctx, points: shrunk(0.78), cell: px, color: beer ? rgb(0.50, 0.26, 0.06, 0.9 * a) : rgb(0.70, 0.87, 0.95, 0.85 * a))
        PixelFX.polygon(ctx, points: shrunk(0.42), cell: px, color: beer ? rgb(0.95, 0.72, 0.35, 0.9 * a) : rgb(1, 1, 1, 0.95 * a))
        ctx.restoreGState()
    }

    private func drawDroplet(_ ctx: CGContext, _ d: Droplet) {
        let a = 1 - d.age / Droplet.lifetime
        let color = d.kind == .beer ? rgb(0.92, 0.62, 0.10, 0.9 * a) : rgb(0.85, 0.94, 1, 0.8 * a)
        PixelFX.block(ctx, at: d.pos, cells: d.radius > 2.2 ? 2 : 1, cell: Self.pixel, color: color)
    }

    private static let spitFoam = rgb(0.93, 0.96, 0.92)
    private static let spitBody = rgb(0.80, 0.88, 0.86)
    private static let spitRim = rgb(0.58, 0.70, 0.70)

    private func drawGlob(_ ctx: CGContext, _ g: SpitGlob) {
        let px = Self.pixel, k = g.progress
        let r = (1.6 + 2.6 * k * k) * px                                   // grows as it nears the glass
        let p = g.pos
        PixelFX.disc(ctx, center: p, radius: r + px, cell: px, color: Self.spitRim)
        PixelFX.disc(ctx, center: p, radius: r, cell: px, color: Self.spitBody)
        PixelFX.block(ctx, at: CGPoint(x: p.x - r * 0.3, y: p.y + r * 0.3), cells: 1, cell: px, color: Self.spitFoam)
        // a few specks trailing behind
        for i in 1...3 {
            let back = g.progress - CGFloat(i) * 0.035
            guard back > 0 else { continue }
            let t = SpitGlob(start: g.start, target: g.target, flight: g.flight, arc: g.arc, age: back * g.flight)
            PixelFX.block(ctx, at: CGPoint(x: t.pos.x, y: t.pos.y + CGFloat(i % 2) * px), cells: 1, cell: px, color: Self.spitBody)
        }
    }

    private func drawSplat(_ ctx: CGContext, _ s: Splat) {
        let px = Self.pixel, a = s.alpha
        func faded(_ c: CGColor) -> CGColor { c.copy(alpha: a) ?? c }
        for d in s.drips {                                                  // drips run down from the blob
            let len = s.dripLength(d)
            guard len > px else { continue }
            let x = s.pos.x + d.dx
            PixelFX.fill(ctx, bounds: CGRect(x: x - px * 2, y: s.pos.y - len - px, width: px * 4, height: len + px), cell: px, color: faded(Self.spitBody)) { p in
                abs(p.x - x) <= CGFloat(d.width) * px * 0.5 + 0.01 && p.y <= s.pos.y && p.y >= s.pos.y - len
            }
            PixelFX.disc(ctx, center: CGPoint(x: x, y: s.pos.y - len), radius: CGFloat(d.width) * px + px * 0.6, cell: px, color: faded(Self.spitBody))
        }
        PixelFX.disc(ctx, center: s.pos, radius: s.radius + px, cell: px, color: faded(Self.spitRim))
        PixelFX.disc(ctx, center: s.pos, radius: s.radius, cell: px, color: faded(Self.spitBody))
        PixelFX.disc(ctx, center: CGPoint(x: s.pos.x - s.radius * 0.25, y: s.pos.y + s.radius * 0.25), radius: s.radius * 0.45, cell: px, color: faded(Self.spitFoam))
        for sp in s.specks {
            PixelFX.block(ctx, at: CGPoint(x: s.pos.x + sp.dx, y: s.pos.y + sp.dy), cells: sp.cells, cell: px, color: faded(Self.spitBody))
        }
    }
}

final class ShatterOverlay {
    private var panel: NSPanel?
    private var view: ShatterView?
    private var timer: Timer?
    private var lastTick = ProcessInfo.processInfo.systemUptime

    /// `from` and `floorY` are in global screen coordinates.
    func throwBottle(_ kind: PropKind, from: CGPoint, velocity: CGVector, floorY: CGFloat, screen: NSScreen) {
        let frame = screen.frame
        prepare(screen: screen, floorY: floorY)
        view?.world.throwBottle(kind, from: CGPoint(x: from.x - frame.minX, y: from.y - frame.minY), velocity: velocity)
        show()
    }

    /// Spit flies from `from` to `target`, both in global screen coordinates, and splats on the glass there.
    func spit(from: CGPoint, to target: CGPoint, screen: NSScreen) {
        let frame = screen.frame
        prepare(screen: screen, floorY: screen.visibleFrame.minY)
        view?.world.launchSpit(from: CGPoint(x: from.x - frame.minX, y: from.y - frame.minY),
                               to: CGPoint(x: target.x - frame.minX, y: target.y - frame.minY))
        show()
    }

    private func prepare(screen: NSScreen, floorY: CGFloat) {
        let frame = screen.frame, visible = screen.visibleFrame
        guard view == nil || panel?.frame != frame else { return }
        buildPanel(frame: frame, floor: floorY - frame.minY, bounds: CGRect(x: visible.minX - frame.minX, y: 0, width: visible.width, height: frame.height))
    }

    private func show() {
        panel?.orderFrontRegardless()
        startTimer()
    }

    private func buildPanel(frame: CGRect, floor: CGFloat, bounds: CGRect) {
        tearDown()
        let panel = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isReleasedWhenClosed = false
        let view = ShatterView(frame: CGRect(origin: .zero, size: frame.size), world: ShatterWorld(floor: floor, bounds: bounds))
        panel.contentView = view
        self.panel = panel
        self.view = view
    }

    private func startTimer() {
        guard timer == nil else { return }
        lastTick = ProcessInfo.processInfo.systemUptime
        let t = Timer(timeInterval: Config.tickInterval, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard let view else { return }
        let now = ProcessInfo.processInfo.systemUptime
        view.world.step(CGFloat(now - lastTick))
        lastTick = now
        view.needsDisplay = true
        if view.world.isEmpty { tearDown() }
    }

    private func tearDown() {
        timer?.invalidate(); timer = nil
        panel?.orderOut(nil)
        panel = nil; view = nil
    }
}
