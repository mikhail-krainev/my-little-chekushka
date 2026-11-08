import CoreGraphics
import Foundation

/// Drinking scenes: take the bottle out, open it, drink, shudder, sway, (sometimes) be sick, throw it away.
struct DrinkTimeline {
    var pull: CGFloat = 0.5          // hand goes for the bottle
    var show: CGFloat = 1.3          // bottle shown to the audience
    var open: CGFloat = 1.8          // cap pops at the end
    var raise: CGFloat = 2.4         // bottle to the mouth
    var chugEnd: CGFloat
    var lowerEnd: CGFloat
    var grimaceEnd: CGFloat
    var swayEnd: CGFloat
    /// Equals `swayEnd` when the drinker keeps it down.
    var vomitEnd: CGFloat
    var windupEnd: CGFloat
    var throwEnd: CGFloat
    var end: TimeInterval
    /// Moment the bottle leaves the hand.
    var release: CGFloat { throwEnd - 0.04 }
    let gulps: Int
    let vomits: Bool

    init(chug: CGFloat, gulps: Int, vomits: Bool) {
        chugEnd = raise + chug
        lowerEnd = chugEnd + 0.6
        grimaceEnd = lowerEnd + 1.3
        swayEnd = grimaceEnd + 0.9
        vomitEnd = swayEnd + (vomits ? MascotAnimator.vomitDuration : 0)
        windupEnd = vomitEnd + 0.7
        throwEnd = windupEnd + 0.25
        end = TimeInterval(throwEnd + 1.1)
        self.gulps = gulps
        self.vomits = vomits
    }
}

extension MascotAnimator {
    /// Fist position of the working arm for an arm swing (see `MascotRig.armTarget`).
    static func fist(_ side: Side, _ swing: CGFloat) -> CGPoint { MascotRig.armTarget(side, swing: swing) }

    /// Bottle angle (right-hand frame) that puts the neck tip on the mascot's mouth for a hand at `hand`.
    private static func aimAtMouth(from hand: CGPoint) -> CGFloat {
        atan2(-(MascotRig.mouth.x - hand.x), MascotRig.mouth.y + 1 - hand.y)
    }

    /// Arm swing (right arm) that puts the fist exactly one bottle length from the mouth, so the neck tip reaches it.
    /// The rigid arm swings across the belly; the bottle points up from there to the mouth.
    private static func chugSwing(_ kind: PropKind) -> CGFloat {
        let s = MascotRig.shoulder[.right]!, m = MascotRig.mouth, len = MascotRig.armLength
        let dx = s.x - m.x, dy = s.y - m.y, reach = hypot(dx, dy)
        let tip = MascotPropDrawing.tipDistance(kind)
        let sine = (tip * tip - dx * dx - dy * dy - len * len) / (2 * len * reach)
        return asin(max(-1, min(1, sine))) + atan2(dy, dx)
    }

    static func drinkTimeline(_ kind: PropKind, vomits: Bool = false) -> DrinkTimeline {
        switch kind {
        case .vodka: return DrinkTimeline(chug: 2.4, gulps: 3, vomits: vomits)      // 0.2 l: three gulps
        case .beer: return DrinkTimeline(chug: 4.2, gulps: 6, vomits: vomits)       // 0.5 l: long pull
        }
    }

    /// The moment something leaves the mascot (bottle thrown, spit launched), or nil for scenes without one.
    static func releaseTime(_ perf: Performance) -> CGFloat? {
        switch perf.kind {
        case .vodka: return drinkTimeline(.vodka, vomits: perf.vomits).release
        case .beer: return drinkTimeline(.beer, vomits: perf.vomits).release
        case .spit: return spitRelease
        default: return nil
        }
    }

    static func drink(_ kind: PropKind, vomits: Bool, t: CGFloat, side: CGFloat, base: Face) -> MascotPose {
        let tl = drinkTimeline(kind, vomits: vomits)
        var p = MascotPose(face: base)
        let work = Side(sign: side), support = work.other
        let rest = MascotRig.restSwing
        let held = fist(work, 1.3)                                  // arm out to the side, bottle presented
        func arm(_ swing: CGFloat) -> CGPoint { fist(work, swing) }
        func mirroredToRight(_ pt: CGPoint) -> CGPoint { MascotPose.mirrored(pt, side: side) }
        var prop = HeldProp(kind: kind, side: work, angle: 0, fill: 1, capOn: true, scale: ease(seg(t, tl.pull - 0.05, tl.pull + 0.2)))
        var hasProp = t >= tl.pull - 0.05 && t < tl.release
        let chug = chugSwing(kind)
        p.hands[work] = arm(rest); p.hands[support] = fist(support, rest)

        if t < tl.pull {                                         // reach out for the bottle
            let k = ease(seg(t, 0, tl.pull))
            p.hands[work] = arm(lerp(rest, 0.75, k))
            p.tilt = -side * 0.04 * k
        } else if t < tl.show {                                  // hold it out, inspect
            let k = ease(seg(t, tl.pull, tl.show))
            p.hands[work] = arm(lerp(0.75, 1.3, k))
            prop.angle = side * -0.12 * k
            p.hands[support] = fist(support, lerp(rest, 0.5, k))
        } else if t < tl.open {                                  // twist the cap off
            let k = seg(t, tl.show, tl.open)
            p.hands[work] = arm(1.3 + 0.04 * sin(k * 40))
            prop.angle = side * (-0.12 + 0.1 * sin(k * 40))
            p.hands[support] = fist(support, 0.5)
            p.tilt = sin(k * 30) * 0.012
        } else if t < tl.raise {                                 // cap flies off, bottle goes up
            let k = ease(seg(t, tl.open, tl.raise))
            prop.capOn = false
            let swing = lerp(1.3, chug, k)
            p.hands[work] = arm(swing)
            prop.angle = side * lerp(-0.12, aimAtMouth(from: mirroredToRight(arm(chug))), k)
            p.hands[support] = fist(support, lerp(0.5, rest, ease(seg(t, tl.open, tl.open + 0.3))))
            p.effects.capFlight = seg(t, tl.open, tl.open + 0.7)
            p.effects.capSide = side
            p.effects.capOrigin = CGPoint(x: held.x + side * 2, y: held.y + MascotPropDrawing.tipDistance(kind))
            p.effects.puff = kind == .beer ? bump(t, tl.open, tl.open + 0.45) * 0.4 : 0
            p.effects.puffSide = side
        } else if t < tl.chugEnd {                               // gulps
            let k = seg(t, tl.raise, tl.chugEnd)
            let gulp = (sin(k * CGFloat(tl.gulps) * .pi * 2 - .pi / 2) + 1) / 2          // 0...1 per gulp
            prop.capOn = false
            let tip = ease(min(1, k * 3))
            p.hands[work] = arm(chug - 0.04 * gulp)
            prop.angle = side * (aimAtMouth(from: mirroredToRight(arm(chug))) + 0.15 * tip)
            prop.fill = max(0, 1 - k)
            p.tilt = side * (0.06 + 0.1 * ease(min(1, k * 3))) - side * 0.025 * gulp
            p.shift.y = -1.2 * gulp
            p.squash = 0.012 * gulp
        } else if t < tl.lowerEnd {                              // bottle comes down, empty
            let k = ease(seg(t, tl.chugEnd, tl.lowerEnd))
            prop.capOn = false; prop.fill = 0
            prop.angle = side * lerp(aimAtMouth(from: mirroredToRight(arm(chug))) + 0.15, 0.0, k)
            p.hands[work] = arm(lerp(chug, 0.6, k))
            p.tilt = side * lerp(0.16, 0, k)
        } else if t < tl.grimaceEnd {                            // "brrr": shudder and exhale
            let k = seg(t, tl.lowerEnd, tl.grimaceEnd)
            let shudder = sin(t * 38) * 0.05 * (1 - k)
            prop.capOn = false; prop.fill = 0
            prop.angle = side * -0.05
            p.hands[work] = arm(0.6 + 0.04 * sin(t * 12))
            p.tilt = shudder
            p.shift.y = 1.5 * abs(sin(t * 19)) * (1 - k)
            p.effects.puff = seg(k, 0, 0.7)
            p.effects.puffSide = side
            p.effects.dizzy = k * 0.5
        } else if t < tl.swayEnd {                               // tipsy sway
            let k = seg(t, tl.grimaceEnd, tl.swayEnd)
            prop.capOn = false; prop.fill = 0
            prop.angle = side * -0.05
            p.hands[work] = arm(0.6)
            p.tilt = sin(t * 4.2) * 0.10
            p.shift.x = sin(t * 4.2) * 3
            p.effects.dizzy = 0.5 + 0.5 * k
            p.hands[support] = fist(support, rest + 0.25 + 0.15 * sin(t * 4.2))
        } else if t < tl.vomitEnd {                              // too much: bends over and is sick
            vomitScene(&p, &prop, k: t - tl.swayEnd, side: side, support: support, work: work)
        } else if t < tl.windupEnd {                             // swing the arm back
            let k = ease(seg(t, tl.vomitEnd, tl.windupEnd))
            prop.capOn = false; prop.fill = 0
            p.hands[work] = arm(lerp(0.6, 2.7, k))
            prop.angle = side * lerp(-0.05, 0.9, k)
            p.tilt = side * 0.18 * k + sin(t * 4.2) * 0.04 * (1 - k)
            p.effects.dizzy = 0.8 * (1 - k)
        } else if t < tl.release {                               // the throw
            let k = ease(seg(t, tl.windupEnd, tl.release))
            prop.capOn = false; prop.fill = 0
            p.hands[work] = arm(lerp(2.7, 1.45, k))
            prop.angle = side * lerp(0.9, -1.2, k)
            p.tilt = side * lerp(0.18, -0.2, k)
            p.shift.y = 2 * k
        } else {                                                 // follow-through, pleased with itself
            let k = seg(t, tl.release, CGFloat(tl.end))
            let settle = ease(seg(t, tl.release, tl.release + 0.5))
            p.hands[work] = arm(lerp(1.45, rest, settle))
            p.tilt = side * lerp(-0.2, 0, settle) + sin(t * 4.2) * 0.05 * (1 - k)
            p.effects.dizzy = 0.6 * (1 - k)
            // hiccup bounce
            p.shift.y = 3 * bump(t, tl.release + 0.5, tl.release + 0.75)
            p.squash = 0.03 * bump(t, tl.release + 0.5, tl.release + 0.75)
            hasProp = false
        }
        p.prop = hasProp ? prop : nil
        if tl.vomits {
            let streamStart = tl.swayEnd + vomitFlowStart
            let fade = seg(t, CGFloat(tl.end) - 0.8, CGFloat(tl.end))
            if t >= streamStart { p.effects.vomit = Vomit(elapsed: t - streamStart, flowEnd: vomitFlowEnd - vomitFlowStart, side: side, isBeer: kind == .beer, fade: fade) }
        }
        return p
    }

    // MARK: Being sick

    static let vomitDuration: CGFloat = 3.4
    private static let vomitFlowStart: CGFloat = 0.8
    private static let vomitFlowEnd: CGFloat = 2.5

    /// `k` is the time since the scene began. The mascot bows from the hips, heaves, and the stream goes to the floor.
    private static func vomitScene(_ p: inout MascotPose, _ prop: inout HeldProp, k: CGFloat, side: CGFloat, support: Side, work: Side) {
        let rest = MascotRig.restSwing
        let bow = ease(seg(k, 0, 0.7)) * (1 - ease(seg(k, 2.8, vomitDuration)))
        let streaming = seg(k, vomitFlowStart, vomitFlowStart + 0.15) * (1 - seg(k, vomitFlowEnd - 0.15, vomitFlowEnd))
        let heave = streaming * (0.5 + 0.5 * sin(k * 15))
        p.pivot = CGPoint(x: 60, y: 58)
        p.tilt = -side * (0.5 * bow + 0.05 * heave)
        p.squash = 0.04 * heave + 0.02 * bow
        p.shift.y = -3 * bow
        p.face.mouthOpen = 0.25 * bow + 0.75 * streaming
        p.effects.dizzy = 0.6
        // the bottle hangs from the working hand, kept upright against the bow and out of the stream's way
        p.hands[work] = fist(work, lerp(0.6, 0.35, bow))
        prop.capOn = false; prop.fill = 0
        prop.angle = side * (0.5 * bow - 0.05)
        // the free arm swings out for balance while heaving, then wipes the face
        let wipe = ease(seg(k, 2.6, 3.0)) * (1 - ease(seg(k, 3.2, vomitDuration)))
        let balance = rest + (0.35 + 0.1 * heave) * bow
        p.hands[support] = fist(support, lerp(balance, 2.45 + 0.08 * sin(k * 22), wipe))
    }
}

