import CoreGraphics
import Foundation

/// Sitting, sleeping and the warm-up routine. The face stays blank: only blinking (and closed eyes asleep).
extension MascotAnimator {
    static let stretchDuration: TimeInterval = 11.6

    static func performance(_ perf: Performance, time t: CGFloat, base: Face) -> MascotPose {
        let d = CGFloat(perf.duration)
        var p: MascotPose
        switch perf.kind {
        case .sit: p = sit(t: t, duration: d, base: base)
        case .sleep: p = sleep(t: t, duration: d, side: perf.side, base: base)
        case .stretch: p = stretch(t: t, base: base)
        case .vodka: p = drink(.vodka, vomits: perf.vomits, t: t, side: perf.side, base: base)
        case .beer: p = drink(.beer, vomits: perf.vomits, t: t, side: perf.side, base: base)
        case .spit: p = spit(t: t, side: perf.side, base: base)
        }
        p.time = t
        return p
    }

    // MARK: Sit on the floor

    private static func sit(t: CGFloat, duration d: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let down = ease(seg(t, 0, 0.45)), up = ease(seg(t, d - 0.55, d))
        let s = down - up
        let thud = bump(t, 0.4, 0.8) * 0.05 + bump(t, d - 0.3, d) * 0.03         // settles with a bounce
        p.shift.y = -21 * s - thud * 10
        p.squash = 0.04 * s + thud
        p.tilt = sin(t * 1.3) * 0.015 * s
        let scratch = bump(t, 1.5, 3.2)
        for side in [Side.left, .right] {
            p.feet[side] = Foot(offset: CGPoint(x: side.sign * 17 * s, y: 16 * s), toeUp: 0.55 * s)
            p.hands[side] = swing(side, MascotRig.restSwing + 0.45 * s)
        }
        // the right hand scratches the back of the head
        if scratch > 0.01 {
            p.hands[.right] = mix(p.hands[.right]!, swing(.right, 2.7 + sin(t * 14) * 0.1), scratch)
        }
        return p
    }

    // MARK: Sleep on its side

    private static func sleep(t: CGFloat, duration d: CGFloat, side: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let stretchIn = bump(t, 0, 0.8)
        let fall = seg(t, 0.8, 1.5), rise = seg(t, d - 1.0, d - 0.15)
        // topple like a skittle: accelerates, then a little bounce
        let lying = max(0, min(1, fall * fall - ease(rise)))
        let bounce = bump(t, 1.5, 1.95) * 0.06
        p.pivot = CGPoint(x: 60, y: 70)
        p.tilt = -side * (lying * (.pi / 2) + bounce * lying)
        p.shift.y = -40 * lying
        let asleep = ease(seg(t, 1.4, 2.0)) * (1 - ease(seg(t, d - 1.0, d - 0.4)))
        p.face.eyesClosed = asleep > 0.5
        p.squash += asleep * 0.012 * sin(t * 1.9)
        p.effects.zzz = asleep > 0.9
        // arms: the lower one is tucked, the upper one rests on the belly; both stretch up on falling asleep and waking
        let lowSide: Side = side > 0 ? .right : .left
        let stretchUp = max(stretchIn, bump(t, d - 0.95, d - 0.1))
        p.hands[lowSide] = swing(lowSide, lerp(MascotRig.restSwing, 2.9, stretchUp))
        p.hands[lowSide.other] = swing(lowSide.other, lerp(MascotRig.restSwing + 0.25 + sin(t * 1.9) * 0.02, 2.9, stretchUp))
        for s in [Side.left, .right] {
            p.feet[s] = Foot(offset: CGPoint(x: -s.sign * 3 * lying, y: 4 * lying), toeUp: -0.3 * lying)
        }
        return p
    }

    // MARK: Warm-up and stretching

    private static func stretch(t: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let rest = MascotRig.restSwing
        let breathe = bump(t, 0, 0.7)

        switch t {
        case ..<0.7:                                             // arms away from the sides, deep breath
            for s in [Side.left, .right] { p.hands[s] = swing(s, lerp(rest, 0.85, ease(seg(t, 0, 0.3)))) }
            p.squash = -0.025 * breathe
        case ..<3.3:                                             // big arm sweeps: out and up, down again (never across the belly)
            let ramp = ease(seg(t, 0.7, 1.1))
            let spin = (t - 0.7) * 5.2
            for s in [Side.left, .right] { p.hands[s] = swing(s, lerp(0.85, 1.9 + sin(spin - .pi / 2) * 1.0, ramp)) }
            p.tilt = sin(spin) * 0.03
        case ..<5.9:                                             // side bends with an arm over the head
            let k = t - 3.3
            let sway = sin(k / 2.6 * .pi * 2 * 1.5)              // left, right, left
            let lean = sway * 0.3
            p.tilt = lean
            p.shift.x = -sway * 4
            let up: Side = sway > 0 ? .right : .left            // arm opposite to the lean goes over
            let ramp = ease(seg(t, 3.3, 3.8))
            for s in [Side.left, .right] {
                p.hands[s] = swing(s, lerp(0.85, s == up ? 2.85 : 0.6, ramp))
                p.feet[s] = Foot(offset: CGPoint(x: s.sign * 5 * ramp, y: 0), toeUp: 0)
            }
        case ..<8.3:                                             // squats
            let k = t - 5.9
            let squat = (1 - cos(k / 0.8 * .pi * 2)) / 2 * ease(seg(t, 5.9, 6.2))
            p.squash = 0.10 * squat
            p.shift.y = -4 * squat
            for s in [Side.left, .right] {
                p.hands[s] = swing(s, 0.85 + 0.35 * squat)
                p.feet[s] = Foot(offset: CGPoint(x: s.sign * (5 + 5 * squat), y: 0), toeUp: 0.1 * squat)
            }
        case ..<10.4:                                            // jumping jacks
            let k = t - 8.3
            let wave = (1 - cos(k / 0.55 * .pi * 2)) / 2           // 0 closed, 1 open
            p.shift.y = abs(sin(k / 0.55 * .pi)) * 6
            for s in [Side.left, .right] {
                p.hands[s] = swing(s, lerp(rest + 0.1, 2.7, wave))
                p.feet[s] = Foot(offset: CGPoint(x: s.sign * 12 * wave, y: 0), toeUp: 0.1)
            }
        default:                                                 // shake out, wipe the forehead
            let k = seg(t, 10.4, 11.6)
            p.effects.puff = bump(t, 10.4, 11.2) > 0 ? seg(t, 10.4, 11.2) : 0
            p.effects.sweat = bump(t, 10.4, 11.4)
            p.hands[.left] = swing(.left, 0.6 + sin(t * 25) * 0.12)
            p.hands[.right] = swing(.right, lerp(rest, 2.4, bump(t, 10.6, 11.6)))
            p.squash = -0.02 * (1 - k)
        }
        return p
    }
}
