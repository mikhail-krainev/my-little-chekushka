import CoreGraphics
import Foundation

/// Spitting scene: hawk up, throw the head back, lunge and spit at a spot anywhere on the screen.
extension MascotAnimator {
    static let spitRelease: CGFloat = 2.05
    static let spitDuration: TimeInterval = 3.4

    private static let hawkStart: CGFloat = 0.4
    private static let hawkEnd: CGFloat = 1.5
    private static let hawkPulses: CGFloat = 3
    private static let drawBackEnd: CGFloat = 1.95

    static func spit(t: CGFloat, side: CGFloat, base: Face) -> MascotPose {
        var p = MascotPose(face: base)
        let work = Side(sign: side), support = work.other
        p.pivot = CGPoint(x: 60, y: 58)

        // 1. hawking: three chest heaves, the head dips with each one
        let hawking = seg(t, hawkStart, hawkEnd)
        let heave = hawking > 0 && hawking < 1 ? max(0, sin(hawking * hawkPulses * .pi * 2)) : 0
        // 2. head thrown back, 3. lunge forward
        let back = ease(seg(t, hawkEnd, drawBackEnd))
        let lunge = ease(seg(t, drawBackEnd, spitRelease))
        let recover = ease(seg(t, spitRelease, spitRelease + 0.6))
        let lean = -0.12 * heave + 0.3 * back - 0.62 * lunge + 0.32 * recover
        p.tilt = side * lean
        p.squash = 0.05 * heave - 0.03 * lunge
        p.shift.y = -2 * heave
        let throatOpen = 0.3 * heave + 0.55 * back * (1 - lunge)
        p.face.mouthOpen = throatOpen + 0.35 * bump(t, spitRelease - 0.1, spitRelease + 0.35)

        // both arms jerk outward with every heave; afterwards the working arm wipes the mouth
        let rest = MascotRig.restSwing
        let wipe = ease(seg(t, 2.4, 2.65)) * (1 - ease(seg(t, 3.0, 3.25)))
        p.hands[support] = swing(support, rest + 0.12 + 0.25 * heave)
        p.hands[work] = swing(work, lerp(rest + 0.25 * heave, 2.45 + sin(t * 24) * 0.08, wipe))
        for s in [Side.left, .right] { p.feet[s] = Foot(offset: CGPoint(x: s.sign * 4, y: 0), toeUp: 0) }
        return p
    }
}
