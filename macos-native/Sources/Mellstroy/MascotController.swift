import AppKit

/// Owns the mascot window and runs its life: roaming, jumping, scripted floor actions (sit, sleep,
/// warm-up, drinking), drag & throw physics, reactions to system events, hanging from the cursor.
final class MascotController {
    struct Jump {
        var from: CGPoint
        var to: CGPoint
        var duration: TimeInterval
        var chaseCursor: Bool
    }

    enum State {
        case idle(until: TimeInterval)
        case walk(to: CGPoint, until: TimeInterval, run: Bool)
        case perform(Performance, start: TimeInterval)
        case crouch(Jump, start: TimeInterval)
        case leap(Jump, start: TimeInterval)
        case land(start: TimeInterval)
        case air                                  // thrown by the user: gravity, bounces
        case dragged
        case hanging(until: TimeInterval)         // dangling from the cursor, swinging as it moves
    }

    let panel: NSPanel
    private let view: MascotView
    private let overlay = ShatterOverlay()
    private var pos: CGPoint
    private var vel: CGVector = .zero
    private var state: State = .idle(until: 0)
    private var pendingPerformance: Performance?
    private var didThrow = false
    private var spitTarget: CGPoint?
    private var facingRight = true
    private var walkPhase: CGFloat = 0
    private var emote: Emote = .neutral
    private var emoteUntil: TimeInterval = 0
    private var nextBlink: TimeInterval = 0
    private var blinkUntil: TimeInterval = 0
    private var timer: Timer?
    private var lastTick = ProcessInfo.processInfo.systemUptime
    private var swingAngle: CGFloat = 0
    private var swingVelocity: CGFloat = 0
    private var prevCursor: CGPoint = .zero
    private var prevCursorVx: CGFloat = 0
    private let size = Config.mascotSize

    var onClick: (() -> Void)?
    /// Visible sprite rect (without the transparent margin), used to place bubbles.
    var frame: CGRect { CGRect(origin: pos, size: size).insetBy(dx: Config.spritePad, dy: Config.spritePad) }

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    private var dir: CGFloat { facingRight ? 1 : -1 }

    init() {
        view = MascotView(frame: CGRect(origin: .zero, size: Config.mascotSize))
        panel = NSPanel(contentRect: CGRect(origin: .zero, size: Config.mascotSize),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.contentView = view
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isReleasedWhenClosed = false
        let screen = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 0, width: 800, height: 600)
        pos = CGPoint(x: screen.midX, y: screen.minY)
        bindMouse()
    }

    func start() {
        panel.setFrameOrigin(pos)
        panel.orderFrontRegardless()
        timer = Timer.scheduledTimer(withTimeInterval: Config.tickInterval, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func stop() { timer?.invalidate(); panel.orderOut(nil) }

    func react(to event: SystemEvent) {
        setEmote(event.emote, for: 2.5)
        if isSleeping { state = .idle(until: now + 1) }
        if case .idle = state, event.emote == .excited || event.emote == .surprised { hop(in: bounds, power: 0.4) }
    }

    /// Starts a floor action now (menu / debugging); walks down to the floor first if needed.
    func trigger(_ kind: Performance.Kind) {
        guard canBeInterrupted else { return }
        schedule(Performance.make(kind, side: dir))
    }

    func wakeAndStare() {
        if isSleeping { state = .idle(until: now + 1) }
        setEmote(.surprised, for: 1)
    }

    // MARK: Mouse

    private var isSleeping: Bool {
        if case .perform(let p, _) = state, p.kind == .sleep { return true }
        return false
    }

    private var canBeInterrupted: Bool {
        switch state {
        case .dragged, .hanging, .air: return false
        default: return true
        }
    }

    private func bindMouse() {
        var grab: CGPoint = .zero
        view.onHover = { [weak self] inside in
            guard let self, inside else { return }
            if self.isSleeping { self.wakeAndStare() } else { self.setEmote(.happy, for: 1.5) }
        }
        view.onClick = { [weak self] in
            guard let self else { return }
            self.wakeAndStare()
            self.onClick?()
        }
        view.onDragBegan = { [weak self] in
            guard let self else { return }
            let m = NSEvent.mouseLocation
            grab = CGPoint(x: m.x - self.pos.x, y: m.y - self.pos.y)
            self.pendingPerformance = nil
            self.state = .dragged
            self.setEmote(.surprised, for: 60)
        }
        view.onDragMoved = { [weak self] m in
            guard let self else { return }
            self.pos = CGPoint(x: m.x - grab.x, y: m.y - grab.y)
            self.panel.setFrameOrigin(self.pos)
        }
        view.onDragEnded = { [weak self] v in
            guard let self else { return }
            let cap = Config.throwVelocityCap
            self.vel = CGVector(dx: max(-cap, min(cap, v.dx)), dy: max(-cap, min(cap, v.dy)))
            self.emoteUntil = self.now + 0.5
            self.state = .air
        }
    }

    // MARK: Simulation

    private var screen: NSScreen? {
        let center = CGPoint(x: pos.x + size.width / 2, y: pos.y + size.height / 2)
        return NSScreen.screens.first { $0.frame.contains(center) } ?? NSScreen.main
    }

    private var bounds: CGRect {
        // Window origins may go `spritePad` past the screen edge: the margin is transparent.
        (screen?.visibleFrame ?? CGRect(x: 0, y: 0, width: 800, height: 600)).insetBy(dx: -Config.spritePad, dy: -Config.spritePad)
    }

    private func tick() {
        let t = now
        let dt = CGFloat(min(t - lastTick, 0.05))
        lastTick = t
        let b = bounds
        let maxX = b.maxX - size.width, ground = b.minY

        if t > emoteUntil { emote = .neutral }
        let base = Face()
        var pose: MascotPose
        let clock = CGFloat(t.truncatingRemainder(dividingBy: 10_000))

        switch state {
        case .idle(let until):
            pose = MascotAnimator.idle(time: clock, base: base)
            if t > until { pickNext(b) }
        case .walk(let target, let until, let run):
            walkPhase += dt * (run ? 14 : 8)
            let arrived = step(toward: target, speed: run ? Config.runSpeed : Config.walkSpeed, dt: dt)
            pose = MascotAnimator.walk(phase: walkPhase, dir: dir, run: run, base: base)
            if arrived || t > until { finishMove(afterIdle: .random(in: 0.5...2.5)) }
        case .perform(let perf, let start):
            let el = CGFloat(t - start)
            pose = MascotAnimator.performance(perf, time: el, base: base)
            if let release = MascotAnimator.releaseTime(perf), !didThrow, el >= release { releaseHeldItem(perf, at: release, base: base) }
            if t - start >= perf.duration { state = .idle(until: t + .random(in: 0.6...1.5)) }
        case .crouch(let jump, let start):
            let k = CGFloat((t - start) / Config.crouchDuration)
            pose = MascotAnimator.crouch(progress: min(1, k), dir: dir, base: base)
            if k >= 1 { state = .leap(jump, start: t) }
        case .leap(let jump, let start):
            let k = min(1, CGFloat((t - start) / jump.duration))
            let arc = min(100, 0.3 * hypot(jump.to.x - jump.from.x, jump.to.y - jump.from.y) + 40) * sin(k * .pi)
            pos = CGPoint(x: jump.from.x + (jump.to.x - jump.from.x) * k, y: jump.from.y + (jump.to.y - jump.from.y) * k + arc)
            pose = MascotAnimator.airborne(progress: k, dir: dir, base: base)
            if k >= 1 {
                pos = jump.to
                if jump.chaseCursor && cursorIsNear() { grabCursor() } else { state = .land(start: t) }
            }
        case .land(let start):
            let k = CGFloat((t - start) / Config.landDuration)
            pose = MascotAnimator.land(progress: min(1, k), base: base)
            if k >= 1 { finishMove(afterIdle: .random(in: 0.3...1.5)) }
        case .air:
            pose = MascotAnimator.flung(time: clock, velocityX: vel.dx, base: base)
            stepAir(dt, bounds: b, maxX: maxX, ground: ground)
        case .dragged:
            pose = MascotAnimator.dragged(time: clock, base: base)
        case .hanging(let until):
            swingOnCursor(dt)
            pose = MascotAnimator.hanging(time: clock, swing: swingAngle, base: base)
            if t > until { releaseCursor() }
        }

        pos.x = max(b.minX, min(maxX, pos.x))
        pos.y = max(ground, min(b.maxY - size.height, pos.y))
        panel.setFrameOrigin(pos)
        updateBlink(t)
        pose.isBlinking = t < blinkUntil
        pose.time = clock
        view.pose = pose
    }

    private func stepAir(_ dt: CGFloat, bounds b: CGRect, maxX: CGFloat, ground: CGFloat) {
        vel.dy -= Config.gravity * dt
        pos.x += vel.dx * dt
        pos.y += vel.dy * dt
        if pos.x < b.minX { pos.x = b.minX; vel.dx = abs(vel.dx) * 0.5 }
        if pos.x > maxX { pos.x = maxX; vel.dx = -abs(vel.dx) * 0.5 }
        let ceiling = b.maxY - size.height
        if pos.y > ceiling { pos.y = ceiling; vel.dy = -abs(vel.dy) * 0.4 }
        guard pos.y <= ground, vel.dy < 0 else { return }
        pos.y = ground
        if abs(vel.dy) > 350 { vel.dy = -vel.dy * 0.4; vel.dx *= 0.7; setEmote(.surprised, for: 0.4); return }
        vel = .zero
        state = .land(start: now)
    }

    /// Moves toward `target` (2D, anywhere on screen). Returns true on arrival.
    private func step(toward target: CGPoint, speed: CGFloat, dt: CGFloat) -> Bool {
        let dx = target.x - pos.x, dy = target.y - pos.y
        let dist = hypot(dx, dy)
        if abs(dx) > 1 { facingRight = dx > 0 }
        if dist < 2 { return true }
        let move = min(dist, speed * dt)
        pos.x += dx / dist * move
        pos.y += dy / dist * move
        return false
    }

    /// After a walk or a landing: start the queued floor action or rest a moment.
    private func finishMove(afterIdle: TimeInterval) {
        if let p = pendingPerformance, isOnFloor {
            pendingPerformance = nil
            begin(p)
        } else {
            pendingPerformance = nil
            state = .idle(until: now + afterIdle)
        }
    }

    // MARK: Decisions

    private var isOnFloor: Bool { pos.y - bounds.minY < 3 }

    private func randomPoint(in b: CGRect) -> CGPoint {
        CGPoint(x: .random(in: b.minX...(b.maxX - size.width)), y: .random(in: b.minY...(b.maxY - size.height)))
    }

    private func pickNext(_ b: CGRect) {
        let t = now
        switch Int.random(in: 0..<100) {
        case 0..<26: state = .walk(to: randomPoint(in: b), until: t + 20, run: false)
        case 26..<38: state = .walk(to: randomPoint(in: b), until: t + 12, run: true)
        case 38..<47: schedule(.make(.sit, side: dir))
        case 47..<55: schedule(.make(.sleep, side: dir))
        case 55..<63: schedule(.make(.stretch, side: dir))
        case 63..<70: schedule(.make(.vodka, side: dir))
        case 70..<77: schedule(.make(.beer, side: dir))
        case 77..<84: schedule(.make(.spit, side: dir))
        case 84..<92: hop(in: b)
        case 92..<97: jumpToCursor(b)
        default: state = .idle(until: t + .random(in: 1...3))
        }
    }

    /// Floor actions start on the floor: hop down first when the mascot is up on the screen.
    private func schedule(_ perf: Performance) {
        if isOnFloor { begin(perf); return }
        pendingPerformance = perf
        let b = bounds
        let target = CGPoint(x: max(b.minX, min(b.maxX - size.width, pos.x + .random(in: -80...80))), y: b.minY)
        startJump(to: target, chase: false)
    }

    private func begin(_ perf: Performance) {
        var perf = perf
        didThrow = false
        if perf.kind == .spit { aimSpit(&perf) }
        if perf.kind == .vodka || perf.kind == .beer || perf.kind == .spit { facingRight = perf.side > 0 }
        state = .perform(perf, start: now)
    }

    /// Picks a random spot anywhere on the screen to spit at and turns toward it.
    private func aimSpit(_ perf: inout Performance) {
        let area = (screen?.visibleFrame ?? bounds).insetBy(dx: Config.spitScreenMargin, dy: Config.spitScreenMargin)
        spitTarget = CGPoint(x: .random(in: area.minX...area.maxX), y: .random(in: area.minY...area.maxY))
        perf.side = (spitTarget?.x ?? 0) >= pos.x + size.width / 2 ? 1 : -1
    }

    /// Short leap to a nearby spot (can be higher up on the screen).
    private func hop(in b: CGRect, power: CGFloat = 1) {
        let reach = 260 * power
        let target = CGPoint(x: max(b.minX, min(b.maxX - size.width, pos.x + .random(in: -reach...reach))),
                             y: max(b.minY, min(b.maxY - size.height, pos.y + .random(in: -reach...reach))))
        startJump(to: target, chase: false)
    }

    private func startJump(to target: CGPoint, chase: Bool) {
        let dist = hypot(target.x - pos.x, target.y - pos.y)
        if abs(target.x - pos.x) > 1 { facingRight = target.x >= pos.x }
        let jump = Jump(from: pos, to: target, duration: max(0.4, min(1.0, TimeInterval(dist / 600))), chaseCursor: chase)
        state = .crouch(jump, start: now)
    }

    // MARK: Throwing the empty bottle, spitting

    private func releaseHeldItem(_ perf: Performance, at release: CGFloat, base: Face) {
        didThrow = true
        if perf.kind == .spit { spit(perf, at: release, base: base) } else { throwBottle(perf, at: release, base: base) }
    }

    private func spit(_ perf: Performance, at release: CGFloat, base: Face) {
        guard let screen, let target = spitTarget else { return }
        let atRelease = MascotAnimator.performance(perf, time: release, base: base)
        let mouth = MascotRenderer.mouthPoint(atRelease)
        let origin = CGPoint(x: pos.x + Config.spritePad + mouth.x * Config.spriteScale,
                             y: pos.y + Config.spritePad + mouth.y * Config.spriteScale)
        overlay.spit(from: origin, to: target, screen: screen)
        spitTarget = nil
    }

    private func throwBottle(_ perf: Performance, at release: CGFloat, base: Face) {
        let kind: PropKind = perf.kind == .beer ? .beer : .vodka
        let atRelease = MascotAnimator.performance(perf, time: release, base: base)
        let hand = MascotRenderer.handPoint(atRelease, Side(sign: perf.side))
        let origin = CGPoint(x: pos.x + Config.spritePad + hand.x * Config.spriteScale,
                             y: pos.y + Config.spritePad + hand.y * Config.spriteScale)
        guard let screen else { return }
        let velocity = CGVector(dx: perf.side * .random(in: 480...640), dy: .random(in: 330...480))
        overlay.throwBottle(kind, from: origin, velocity: velocity, floorY: screen.visibleFrame.minY, screen: screen)
    }

    // MARK: Cursor grabbing

    /// Offset from the window origin to the raised right hand, which is pinned to the cursor.
    private func handOffset() -> CGPoint {
        CGPoint(x: Config.spritePad + MascotRig.hangHand.x * Config.spriteScale,
                y: Config.spritePad + MascotRig.hangHand.y * Config.spriteScale)
    }

    private func cursorIsNear() -> Bool {
        let m = NSEvent.mouseLocation
        let off = handOffset()
        return hypot(m.x - (pos.x + off.x), m.y - (pos.y + off.y)) < 80
    }

    private func jumpToCursor(_ b: CGRect) {
        let m = NSEvent.mouseLocation
        guard b.contains(m) else { state = .idle(until: now + 1); return }
        let off = handOffset()
        startJump(to: CGPoint(x: max(b.minX, min(b.maxX - size.width, m.x - off.x)),
                              y: max(b.minY, min(b.maxY - size.height, m.y - off.y))), chase: true)
    }

    private func grabCursor() {
        swingAngle = 0; swingVelocity = 0
        prevCursor = NSEvent.mouseLocation; prevCursorVx = 0
        panel.ignoresMouseEvents = true            // the cursor sits on the hand: let clicks reach apps below
        state = .hanging(until: now + Config.hangDuration)
    }

    /// The mascot follows the cursor like a pendulum. The cursor itself is never touched.
    private func swingOnCursor(_ dt: CGFloat) {
        guard dt > 0 else { return }
        let m = NSEvent.mouseLocation
        let off = handOffset()
        let follow = min(1, dt * 16)
        pos.x += (m.x - off.x - pos.x) * follow
        pos.y += (m.y - off.y - pos.y) * follow

        let vx = prevCursorVx * 0.6 + ((m.x - prevCursor.x) / dt) * 0.4
        swingVelocity += (-35 * swingAngle - 3 * swingVelocity) * dt       // gravity + damping
        swingVelocity += -(vx - prevCursorVx) * 0.0035                      // cursor acceleration kicks the body
        swingVelocity = max(-12, min(12, swingVelocity))
        swingAngle = max(-1, min(1, swingAngle + swingVelocity * dt))
        prevCursor = m; prevCursorVx = vx
    }

    private func releaseCursor() {
        panel.ignoresMouseEvents = false
        setEmote(.surprised, for: 1)
        vel = .zero
        state = .air                               // lets go and drops to the floor
    }

    // MARK: Helpers

    private func setEmote(_ e: Emote, for seconds: TimeInterval) {
        emote = e
        emoteUntil = now + seconds
    }

    private func updateBlink(_ t: TimeInterval) {
        if t > nextBlink { blinkUntil = t + 0.12; nextBlink = t + .random(in: 2...5) }
    }
}
