import CoreGraphics
import Foundation

/// A scripted action that runs on the floor.
struct Performance: Equatable {
    enum Kind: CaseIterable { case sit, sleep, stretch, vodka, beer, spit }
    /// Chance that a drinker is sick after the bottle.
    static let vomitChance = 0.5

    var kind: Kind
    var duration: TimeInterval
    /// +1 acts toward the right (working arm is the right one), -1 mirrored.
    var side: CGFloat
    /// Drinks only: the drinker throws up after the bottle.
    var vomits = false

    static func make(_ kind: Kind, side: CGFloat = Bool.random() ? 1 : -1, vomits: Bool = Double.random(in: 0..<1) < vomitChance) -> Performance {
        let duration: TimeInterval
        var sick = false
        switch kind {
        case .sit: duration = 1.1 + .random(in: 3...6)
        case .sleep: duration = 2.4 + .random(in: 7...13)
        case .stretch: duration = MascotAnimator.stretchDuration
        case .vodka: sick = vomits; duration = MascotAnimator.drinkTimeline(.vodka, vomits: vomits).end
        case .beer: sick = vomits; duration = MascotAnimator.drinkTimeline(.beer, vomits: vomits).end
        case .spit: duration = MascotAnimator.spitDuration
        }
        return Performance(kind: kind, duration: duration, side: side, vomits: sick)
    }
}

/// Pure functions: state and time in, pose out. No AppKit, so poses are testable and previewable.
enum MascotAnimator {
    // MARK: Helpers

    static func seg(_ t: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat {
        guard b > a else { return t >= b ? 1 : 0 }
        return min(1, max(0, (t - a) / (b - a)))
    }

    static func ease(_ x: CGFloat) -> CGFloat { x * x * (3 - 2 * x) }

    /// Bell between a and b (0 outside, 1 in the middle).
    static func bump(_ t: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { sin(seg(t, a, b) * .pi) }

    static func mix(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        CGPoint(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t))
    }

    /// Hand target for an arm swinging rigidly about the shoulder (see `MascotRig.armTarget`).
    static func swing(_ side: Side, _ angle: CGFloat) -> CGPoint { MascotRig.armTarget(side, swing: angle) }

    // MARK: Locomotion

    static func idle(time t: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        p.time = t
        p.squash = sin(t * 2.3) * 0.010
        p.tilt = sin(t * 1.1) * 0.012
        for side in [Side.left, .right] {
            p.hands[side] = swing(side, MascotRig.restSwing + sin(t * 1.6 + (side == .left ? 0 : 1.3)) * 0.02)
        }
        return p
    }

    /// `phase` advances while moving; `dir` is +1/-1 along x.
    static func walk(phase: CGFloat, dir: CGFloat, run: Bool, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let bob = abs(sin(phase)) * (run ? 5 : 2.4)
        let lift: CGFloat = run ? 11 : 5.5
        let reach: CGFloat = run ? 12 : 7
        p.shift.y = bob
        p.tilt = sin(phase) * (run ? 0.05 : 0.07) - dir * (run ? 0.13 : 0.035)
        p.squash = (1 - abs(sin(phase))) * (run ? 0.03 : 0.015)
        for side in [Side.left, .right] {
            let ph = phase + (side == .left ? 0 : .pi)
            let planted = -bob
            let up = max(0, cos(ph))
            p.feet[side] = Foot(offset: CGPoint(x: sin(ph) * reach * 0.45, y: up * lift + (up > 0 ? 0 : planted)),
                                toeUp: up * 0.25)
            // arms swing out and in against the legs; wider and faster when running
            p.hands[side] = run ? swing(side, 0.5 + sin(ph) * 0.45) : swing(side, MascotRig.restSwing + 0.04 + sin(ph + .pi) * 0.14)
        }
        return p
    }

    static func crouch(progress k: CGFloat, dir: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let e = ease(k)
        p.squash = 0.17 * e
        p.tilt = -dir * 0.05 * e
        for side in [Side.left, .right] {
            p.hands[side] = swing(side, MascotRig.restSwing + 0.3 * e)
            p.feet[side] = Foot(offset: CGPoint(x: side.sign * 3 * e, y: 0), toeUp: 0)
        }
        return p
    }

    /// k: 0 take-off ... 1 touch-down.
    static func airborne(progress k: CGFloat, dir: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let up = cos(k * .pi)                       // +1 rising, -1 falling
        p.squash = -0.08 * sin(k * .pi)
        p.tilt = -dir * 0.1 * up
        for side in [Side.left, .right] {
            let spread = 1 - max(0, up)             // arms shoot up, then open for balance
            p.hands[side] = swing(side, 2.6 - 0.9 * spread)
            let tuck = sin(k * .pi)
            p.feet[side] = Foot(offset: CGPoint(x: -side.sign * 3 * tuck, y: 9 * tuck), toeUp: -0.25 * tuck)
        }
        return p
    }

    static func land(progress k: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let squash = 0.17 * (1 - ease(k)) * cos(k * 5)       // soft rebound
        p.squash = squash
        for side in [Side.left, .right] {
            p.hands[side] = swing(side, MascotRig.restSwing + 0.5 * (1 - k))
        }
        return p
    }

    /// Thrown by the user: tumbling, flailing.
    static func flung(time t: CGFloat, velocityX: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        p.time = t
        p.tilt = max(-0.7, min(0.7, -velocityX / 1800)) + sin(t * 16) * 0.05
        for side in [Side.left, .right] {
            let w = sin(t * 18 + (side == .left ? 0 : 2))
            p.hands[side] = swing(side, 1.9 + 0.4 * w)
            p.feet[side] = Foot(offset: CGPoint(x: -side.sign * 4, y: 8 + 5 * sin(t * 14 + (side == .left ? 1 : 0))), toeUp: 0.2)
        }
        return p
    }

    static func dragged(time t: CGFloat, base: Face) -> MascotPose {
        var p = flung(time: t, velocityX: 0, base: base)
        p.tilt = sin(t * 7) * 0.08
        return p
    }

    /// Dangling from the cursor by the raised right hand.
    static func hanging(time t: CGFloat, swing: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        p.time = t
        p.hangTilt = swing
        p.hands[.right] = MascotRig.hangHand
        p.hands[.left] = MascotAnimator.swing(.left, 0.7 + 0.15 * sin(t * 3))
        for side in [Side.left, .right] {
            p.feet[side] = Foot(offset: CGPoint(x: sin(t * 5 + (side == .left ? 0 : 1.5)) * 3 - side.sign * 2, y: 6 + cos(t * 5 + (side == .left ? 0 : 1.5)) * 3), toeUp: -0.3)
        }
        return p
    }
}
