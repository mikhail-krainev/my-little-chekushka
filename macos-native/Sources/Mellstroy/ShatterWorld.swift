import CoreGraphics
import Foundation

/// Deterministic generator so the glass simulation can be tested.
struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

struct FlyingBottle {
    var kind: PropKind
    var pos: CGPoint
    var vel: CGVector
    var angle: CGFloat
    var spin: CGFloat
}

struct Shard {
    var kind: PropKind
    var pos: CGPoint
    var vel: CGVector
    var angle: CGFloat
    var spin: CGFloat
    var points: [CGPoint]            // polygon around the origin
    var radius: CGFloat
    var age: CGFloat = 0
    var isResting = false

    var alpha: CGFloat {
        let fadeStart = Config.shardLifetime - Config.shardFadeDuration
        return age < fadeStart ? 1 : max(0, 1 - (age - fadeStart) / Config.shardFadeDuration)
    }
}

struct Droplet {
    var kind: PropKind
    var pos: CGPoint
    var vel: CGVector
    var radius: CGFloat
    var age: CGFloat = 0
    static let lifetime: CGFloat = 0.8
}

/// A glob of spit in flight toward a spot on the screen glass.
struct SpitGlob {
    var start: CGPoint
    var target: CGPoint
    var flight: CGFloat
    var arc: CGFloat
    var age: CGFloat = 0

    var progress: CGFloat { min(1, age / flight) }
    var pos: CGPoint {
        let k = progress
        return CGPoint(x: start.x + (target.x - start.x) * k, y: start.y + (target.y - start.y) * k + arc * sin(k * .pi))
    }
}

/// Spit that hit the screen: a blob with specks that slides down in drips, then dries and fades.
struct Splat {
    struct Drip { var dx: CGFloat; var speed: CGFloat; var maxLength: CGFloat; var width: Int }
    struct Speck { var dx: CGFloat; var dy: CGFloat; var cells: Int }

    var pos: CGPoint
    var radius: CGFloat
    var drips: [Drip]
    var specks: [Speck]
    var age: CGFloat = 0
    static let lifetime: CGFloat = 5
    static let fadeDuration: CGFloat = 1

    var alpha: CGFloat { age < Splat.lifetime - Splat.fadeDuration ? 1 : max(0, 1 - (age - (Splat.lifetime - Splat.fadeDuration)) / Splat.fadeDuration) }
    func dripLength(_ d: Drip) -> CGFloat { min(d.maxLength, d.speed * age * (1 - 0.12 * age)) }
}

/// Physics of a thrown bottle: flight, impact, shards flying over the desktop, droplets; and of spit on the screen.
/// Shards lie on the floor until `Config.shardLifetime` seconds after the impact, then fade away.
struct ShatterWorld {
    var floor: CGFloat
    var bounds: CGRect
    private(set) var bottles: [FlyingBottle] = []
    private(set) var shards: [Shard] = []
    private(set) var droplets: [Droplet] = []
    private(set) var spits: [SpitGlob] = []
    private(set) var splats: [Splat] = []
    private var rng: SplitMix64

    var isEmpty: Bool { bottles.isEmpty && shards.isEmpty && droplets.isEmpty && spits.isEmpty && splats.isEmpty }

    init(floor: CGFloat, bounds: CGRect, seed: UInt64 = UInt64.random(in: 0...UInt64.max)) {
        self.floor = floor
        self.bounds = bounds
        rng = SplitMix64(seed: seed)
    }

    mutating func throwBottle(_ kind: PropKind, from: CGPoint, velocity: CGVector) {
        bottles.append(FlyingBottle(kind: kind, pos: from, vel: velocity, angle: 0, spin: CGFloat.random(in: 9...15, using: &rng) * (velocity.dx >= 0 ? -1 : 1)))
    }

    mutating func launchSpit(from: CGPoint, to target: CGPoint) {
        let distance = hypot(target.x - from.x, target.y - from.y)
        spits.append(SpitGlob(start: from, target: target, flight: 0.45 + distance / 2200, arc: 40 + distance * 0.12))
    }

    mutating func step(_ dtRaw: CGFloat) {
        let dt = min(dtRaw, 1.0 / 30)
        stepBottles(dt)
        stepShards(dt)
        stepDroplets(dt)
        stepSpits(dt)
    }

    private mutating func stepSpits(_ dt: CGFloat) {
        var flying: [SpitGlob] = []
        for var glob in spits {
            glob.age += dt
            if glob.progress >= 1 { splash(at: glob.target) } else { flying.append(glob) }
        }
        spits = flying
        for i in splats.indices { splats[i].age += dt }
        splats.removeAll { $0.age >= Splat.lifetime }
    }

    private mutating func splash(at p: CGPoint) {
        let radius = CGFloat.random(in: 9...13, using: &rng)
        let drips = (0..<Int.random(in: 2...4, using: &rng)).map { _ in
            Splat.Drip(dx: CGFloat.random(in: -radius * 0.6...radius * 0.6, using: &rng), speed: CGFloat.random(in: 14...30, using: &rng),
                       maxLength: CGFloat.random(in: 14...42, using: &rng), width: Int.random(in: 1...2, using: &rng))
        }
        let specks = (0..<Int.random(in: 6...10, using: &rng)).map { _ in
            let angle = CGFloat.random(in: 0...(2 * .pi), using: &rng), dist = CGFloat.random(in: radius * 1.1...radius * 2.1, using: &rng)
            return Splat.Speck(dx: cos(angle) * dist, dy: sin(angle) * dist, cells: Int.random(in: 1...2, using: &rng))
        }
        splats.append(Splat(pos: p, radius: radius, drips: drips, specks: specks))
    }

    private mutating func stepBottles(_ dt: CGFloat) {
        var survivors: [FlyingBottle] = []
        for var b in bottles {
            b.vel.dy -= Config.gravity * dt
            b.pos.x += b.vel.dx * dt
            b.pos.y += b.vel.dy * dt
            b.angle += b.spin * dt
            let hitWall = b.pos.x < bounds.minX || b.pos.x > bounds.maxX
            if hitWall { b.pos.x = min(max(b.pos.x, bounds.minX), bounds.maxX); b.vel.dx = -b.vel.dx * 0.5 }
            if b.pos.y <= floor + 6 {
                shatter(b)
            } else {
                survivors.append(b)
            }
        }
        bottles = survivors
    }

    private mutating func shatter(_ b: FlyingBottle) {
        let impact = CGPoint(x: b.pos.x, y: floor + 3)
        let count = b.kind == .beer ? 34 : 26
        for i in 0..<count {
            let angle = CGFloat.random(in: 0.12 * .pi...0.88 * .pi, using: &rng)
            let speed = CGFloat.random(in: 250...1050, using: &rng)
            let big = i < 3                                  // a few larger chunks: base, neck, side
            let size = big ? CGFloat.random(in: 9...14, using: &rng) : CGFloat.random(in: 3...8.5, using: &rng)
            let vel = CGVector(dx: cos(angle) * speed + b.vel.dx * 0.35, dy: sin(angle) * speed * 0.75 + 140)
            shards.append(Shard(kind: b.kind,
                                pos: CGPoint(x: impact.x + CGFloat.random(in: -8...8, using: &rng), y: impact.y + CGFloat.random(in: 0...6, using: &rng)),
                                vel: vel,
                                angle: CGFloat.random(in: 0...(2 * .pi), using: &rng),
                                spin: CGFloat.random(in: -18...18, using: &rng),
                                points: shardPolygon(size: size, long: i % 5 == 4),
                                radius: size * 0.45))
        }
        for _ in 0..<16 {
            let angle = CGFloat.random(in: 0.05 * .pi...0.95 * .pi, using: &rng)
            let speed = CGFloat.random(in: 150...600, using: &rng)
            droplets.append(Droplet(kind: b.kind, pos: impact, vel: CGVector(dx: cos(angle) * speed, dy: sin(angle) * speed),
                                    radius: CGFloat.random(in: 1.3...3.2, using: &rng)))
        }
    }

    private mutating func shardPolygon(size: CGFloat, long: Bool) -> [CGPoint] {
        let sides = Int.random(in: 3...5, using: &rng)
        let stretch: CGFloat = long ? 2.2 : CGFloat.random(in: 0.5...1.4, using: &rng)
        var pts: [CGPoint] = []
        var angle = CGFloat.random(in: 0...(2 * .pi), using: &rng)
        for _ in 0..<sides {
            let r = size * CGFloat.random(in: 0.45...1.0, using: &rng)
            pts.append(CGPoint(x: cos(angle) * r * stretch, y: sin(angle) * r))
            angle += (2 * .pi / CGFloat(sides)) * CGFloat.random(in: 0.7...1.3, using: &rng)
        }
        return pts
    }

    private mutating func stepShards(_ dt: CGFloat) {
        for i in shards.indices {
            shards[i].age += dt
            guard !shards[i].isResting else { continue }
            var s = shards[i]
            s.vel.dy -= Config.gravity * dt
            s.pos.x += s.vel.dx * dt
            s.pos.y += s.vel.dy * dt
            s.angle += s.spin * dt
            if s.pos.x < bounds.minX { s.pos.x = bounds.minX; s.vel.dx = abs(s.vel.dx) * 0.5 }
            if s.pos.x > bounds.maxX { s.pos.x = bounds.maxX; s.vel.dx = -abs(s.vel.dx) * 0.5 }
            if s.pos.y - s.radius <= floor {
                s.pos.y = floor + s.radius
                if abs(s.vel.dy) > 120 {
                    s.vel.dy = -s.vel.dy * 0.32
                    s.vel.dx *= 0.78
                    s.spin *= 0.6
                } else {
                    s.vel.dy = 0
                    s.vel.dx *= max(0, 1 - 7 * dt)          // slide to a stop
                    s.spin *= max(0, 1 - 9 * dt)
                    if abs(s.vel.dx) < 8 { s.vel.dx = 0; s.spin = 0; s.isResting = true }
                }
            }
            shards[i] = s
        }
        shards.removeAll { $0.age >= Config.shardLifetime }
    }

    private mutating func stepDroplets(_ dt: CGFloat) {
        for i in droplets.indices {
            droplets[i].age += dt
            droplets[i].vel.dy -= Config.gravity * dt * 0.8
            droplets[i].pos.x += droplets[i].vel.dx * dt
            droplets[i].pos.y += droplets[i].vel.dy * dt
            if droplets[i].pos.y < floor { droplets[i].pos.y = floor; droplets[i].vel = CGVector(dx: droplets[i].vel.dx * 0.5, dy: 0) }
        }
        droplets.removeAll { $0.age >= Droplet.lifetime }
    }
}
