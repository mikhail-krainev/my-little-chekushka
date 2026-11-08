import CoreGraphics

/// Skeleton and pose description of the bottle mascot. Logical units: sprite is 120×180, origin bottom-left, y up.
enum Side {
    case left, right
    var sign: CGFloat { self == .left ? -1 : 1 }
    var other: Side { self == .left ? .right : .left }
    init(sign: CGFloat) { self = sign < 0 ? .left : .right }
}

enum MascotRig {
    static let size = CGSize(width: 120, height: 180)
    static let centerX: CGFloat = 60
    // Joints read off the reference picture (see RefMap).
    static let shoulder: [Side: CGPoint] = [.left: RefMap.point(163, 380), .right: RefMap.point(RefMap.mirroredX(163), 380)]
    static let elbowRest: [Side: CGPoint] = [.left: RefMap.point(143, 442), .right: RefMap.point(RefMap.mirroredX(143), 442)]
    static let restHand: [Side: CGPoint] = [.left: RefMap.point(140, 497), .right: RefMap.point(RefMap.mirroredX(140), 497)]
    static let hip: [Side: CGPoint] = [.left: RefMap.point(196, 520), .right: RefMap.point(293, 520)]
    static let upperArm: CGFloat = hypot(elbowRest[.left]!.x - shoulder[.left]!.x, elbowRest[.left]!.y - shoulder[.left]!.y)
    static let foreArm: CGFloat = hypot(restHand[.left]!.x - elbowRest[.left]!.x, restHand[.left]!.y - elbowRest[.left]!.y)
    static let mouth = RefMap.point(259, 355)
    static let eyes: [Side: CGPoint] = [.left: RefMap.point(232, 291), .right: RefMap.point(284, 292)]
    static let headTop = CGPoint(x: 60, y: 172)
    /// The hand that is pinned to the cursor while hanging from it.
    static let hangHand = CGPoint(x: 104, y: 127)
}

struct ArmSolution {
    var shoulder: CGPoint
    var elbow: CGPoint
    var hand: CGPoint
}

extension MascotRig {
    /// Full length of the arm, shoulder to fist.
    static let armLength: CGFloat = upperArm + foreArm

    /// Where the fist is when the whole arm swings by `swing` radians about the shoulder.
    /// 0 = hanging straight down, ±π/2 = horizontal (+ away from the body, - across it), π = straight up.
    static func armTarget(_ side: Side, swing: CGFloat) -> CGPoint {
        let s = shoulder[side]!
        return CGPoint(x: s.x + side.sign * sin(swing) * armLength, y: s.y - cos(swing) * armLength)
    }

    /// Resting swing, the arm as drawn in the reference.
    static let restSwing: CGFloat = atan2(abs(restHand[.left]!.x - shoulder[.left]!.x), shoulder[.left]!.y - restHand[.left]!.y)

    /// The arm is a rigid piece cut from the reference: it swings about the shoulder and keeps its shape.
    /// Only the direction of `target` matters; the fist always ends at full reach along it.
    static func solveArm(_ side: Side, target: CGPoint) -> ArmSolution {
        let s = shoulder[side]!, rest = restHand[side]!, elbow0 = elbowRest[side]!
        let v = CGPoint(x: target.x - s.x, y: target.y - s.y)
        guard hypot(v.x, v.y) > 0.001 else { return ArmSolution(shoulder: s, elbow: elbow0, hand: rest) }
        let turn = atan2(v.y, v.x) - atan2(rest.y - s.y, rest.x - s.x)
        func turned(_ p: CGPoint) -> CGPoint {
            let d = CGPoint(x: p.x - s.x, y: p.y - s.y)
            return CGPoint(x: s.x + d.x * cos(turn) - d.y * sin(turn), y: s.y + d.x * sin(turn) + d.y * cos(turn))
        }
        return ArmSolution(shoulder: s, elbow: turned(elbow0), hand: turned(rest))
    }
}

/// The photo face never emotes: it only blinks. The mouth opens solely for spitting and being sick.
struct Face: Equatable {
    var eyesClosed = false             // asleep
    var mouthOpen: CGFloat = 0
}

struct Foot: Equatable {
    var offset = CGPoint.zero
    /// Toe-up amount in radians (the shoe is built for the right foot and mirrored for the left).
    var toeUp: CGFloat = 0
}

enum PropKind { case vodka, beer }

struct HeldProp: Equatable {
    var kind: PropKind
    var side: Side
    var angle: CGFloat                 // radians, 0 = upright, + = neck toward the left
    var fill: CGFloat                  // 0...1
    var capOn: Bool
    var scale: CGFloat = 1
}

/// Sick on the floor: a stream from the mouth into a puddle.
struct Vomit: Equatable {
    var elapsed: CGFloat               // seconds since the first heave
    var flowEnd: CGFloat               // the stream stops at this moment
    var side: CGFloat                  // +1 right, -1 left
    var isBeer: Bool
    var fade: CGFloat = 0              // 0...1 puddle drying up
}

struct Effects: Equatable {
    var zzz = false
    var puff: CGFloat = 0              // exhale smoke progress 0 none, 0...1
    var puffSide: CGFloat = 1          // smoke drifts toward +1 right or -1 left
    var dizzy: CGFloat = 0             // 0...1 stars over the head
    var capFlight: CGFloat = 0         // flying bottle cap progress 0 none, 0...1
    var capSide: CGFloat = 1
    var capOrigin = CGPoint.zero
    var sweat: CGFloat = 0
    var vomit: Vomit?
}

struct MascotPose {
    var face = Face()
    var isBlinking = false
    var shift = CGPoint.zero           // body offset, logical units
    var tilt: CGFloat = 0              // radians around `pivot`, + = counter-clockwise
    var pivot = CGPoint(x: 60, y: 0)
    var squash: CGFloat = 0            // + squat (wider, shorter), - stretched
    var hands: [Side: CGPoint] = MascotRig.restHand
    var feet: [Side: Foot] = [.left: Foot(), .right: Foot()]
    var prop: HeldProp?
    var effects = Effects()
    var hangTilt: CGFloat = 0          // swing around the hand pinned to the cursor
    var time: CGFloat = 0              // seconds, drives decorations

    init(face: Face = Face()) { self.face = face }

    /// Sets hands for a mirrored routine written for the right working arm.
    mutating func setHands(working side: Side, work: CGPoint, support: CGPoint) {
        hands[side] = work
        hands[side.other] = support
    }
}

extension MascotPose {
    static func mirrored(_ p: CGPoint, side: CGFloat) -> CGPoint {
        side > 0 ? p : CGPoint(x: MascotRig.size.width - p.x, y: p.y)
    }
}
