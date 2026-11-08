import AppKit

/// Composes the mascot from pixel-art parts cut from the reference picture. Sprite units, origin bottom-left, y up.
enum MascotRenderer {
    static func bodyTransform(_ pose: MascotPose) -> CGAffineTransform {
        let p = pose.pivot
        var t = CGAffineTransform(translationX: -p.x, y: -p.y)
        t = t.concatenating(CGAffineTransform(scaleX: 1 + pose.squash * 0.6, y: 1 - pose.squash))
        t = t.concatenating(CGAffineTransform(rotationAngle: pose.tilt))
        t = t.concatenating(CGAffineTransform(translationX: p.x + pose.shift.x, y: p.y + pose.shift.y))
        if pose.hangTilt != 0 {
            let h = MascotRig.hangHand
            t = t.concatenating(CGAffineTransform(translationX: -h.x, y: -h.y))
                .concatenating(CGAffineTransform(rotationAngle: pose.hangTilt))
                .concatenating(CGAffineTransform(translationX: h.x, y: h.y))
        }
        return t
    }

    /// Where a hand ends up in sprite units (used to launch the thrown bottle).
    static func handPoint(_ pose: MascotPose, _ side: Side) -> CGPoint {
        let sol = MascotRig.solveArm(side, target: pose.hands[side] ?? MascotRig.restHand[side]!)
        return sol.hand.applying(bodyTransform(pose))
    }

    /// Where the mouth ends up in sprite units (used to launch spit).
    static func mouthPoint(_ pose: MascotPose) -> CGPoint {
        MascotRig.mouth.applying(bodyTransform(pose))
    }

    static func draw(_ pose: MascotPose, in ctx: CGContext) {
        ctx.saveGState()
        ctx.setShouldAntialias(false)                       // crisp, pixel-art edges
        ctx.interpolationQuality = .none
        drawShadow(pose, ctx)
        let xf = bodyTransform(pose)
        ctx.saveGState()
        ctx.concatenate(xf)
        for side in [Side.left, .right] { drawLeg(ctx, pose, side) }
        MascotSprites.bodyPart?.draw(ctx, anchor: RefMap.point(241, 581), angle: 0)
        MascotFaceOverlay.draw(ctx, pose.face, blink: pose.isBlinking)
        if let prop = pose.prop { drawProp(ctx, pose, prop) }
        for side in [Side.left, .right] { drawArm(ctx, pose, side) }
        drawBodyEffects(ctx, pose)
        ctx.restoreGState()
        drawWorldEffects(ctx, pose, xf)
        ctx.restoreGState()
    }

    private static func drawShadow(_ pose: MascotPose, _ ctx: CGContext) {
        let width: CGFloat = abs(pose.tilt) > 1 ? 130 : 66
        PixelFX.ellipse(ctx, center: CGPoint(x: MascotRig.centerX, y: 1), rx: width / 2, ry: 4, color: rgb(0, 0, 0, 0.20))
    }

    private static func drawLeg(_ ctx: CGContext, _ pose: MascotPose, _ side: Side) {
        guard let part = MascotSprites.legs[side] else { return }
        let foot = pose.feet[side] ?? Foot()
        let hip = MascotRig.hip[side]!
        let swing = foot.offset.x * 0.025 + side.sign * foot.toeUp * 0.5
        part.draw(ctx, anchor: CGPoint(x: hip.x + foot.offset.x * 0.6, y: hip.y + foot.offset.y), angle: swing)
    }

    /// The original reference sprites, unmodified. The sleeve and the forearm turn together about the shoulder,
    /// so the arm keeps its shape in every pose.
    private static func drawArm(_ ctx: CGContext, _ pose: MascotPose, _ side: Side) {
        guard let upper = MascotSprites.upperArms[side], let fore = MascotSprites.foreArms[side] else { return }
        let sol = MascotRig.solveArm(side, target: pose.hands[side] ?? MascotRig.restHand[side]!)
        let shoulder = MascotRig.shoulder[side]!, elbowRest = MascotRig.elbowRest[side]!
        let turn = atan2(sol.elbow.y - sol.shoulder.y, sol.elbow.x - sol.shoulder.x) - atan2(elbowRest.y - shoulder.y, elbowRest.x - shoulder.x)
        fore.draw(ctx, anchor: sol.elbow, angle: turn)
        upper.draw(ctx, anchor: sol.shoulder, angle: turn)
    }

    private static func drawProp(_ ctx: CGContext, _ pose: MascotPose, _ prop: HeldProp) {
        let hand = MascotRig.solveArm(prop.side, target: pose.hands[prop.side] ?? MascotRig.restHand[prop.side]!).hand
        ctx.saveGState()
        ctx.translateBy(x: hand.x, y: hand.y)
        ctx.rotate(by: prop.angle)
        ctx.scaleBy(x: prop.scale, y: prop.scale)
        MascotPropDrawing.draw(ctx, kind: prop.kind, angle: prop.angle, fill: prop.fill, capOn: prop.capOn)
        ctx.restoreGState()
    }

    // MARK: Effects

    private static let sparkle = ["..X..", ".XXX.", "XXXXX", ".XXX.", "..X.."]
    private static let teardrop = [".X.", ".X.", "XXX", "XXX", ".X."]
    private static let letterZ = ["XXXXX", "....X", "...X.", ".X...", "XXXXX"]

    private static func drawBodyEffects(_ ctx: CGContext, _ pose: MascotPose) {
        let e = pose.effects
        let mouth = MascotRig.mouth
        if e.puff > 0 {                                         // exhaled smoke
            let k = e.puff
            for i in 0..<4 {
                let f = CGFloat(i)
                let c = CGPoint(x: mouth.x + e.puffSide * (9 + 20 * k + f * 6 * k), y: mouth.y + 2 + 12 * k + f * 3 * k)
                let r = 2.5 + 5 * k + f * 0.8
                PixelFX.disc(ctx, center: c, radius: r, color: rgb(0.74, 0.77, 0.83, 0.75 * (1 - k)))
                PixelFX.disc(ctx, center: c, radius: max(0, r - PixelFX.cell * 1.2), color: rgb(1, 1, 1, 0.8 * (1 - k)))
            }
        }
        if e.dizzy > 0.02 {
            for i in 0..<3 {
                let a = pose.time * 4 + CGFloat(i) * 2.09
                let c = CGPoint(x: MascotRig.headTop.x + cos(a) * 20, y: MascotRig.headTop.y + 6 + sin(a) * 5)
                PixelFX.bitmap(ctx, rows: sparkle, topLeft: CGPoint(x: c.x - 3, y: c.y + 3), color: rgb(1, 0.85, 0.2, e.dizzy))
            }
        }
        if e.sweat > 0.02 {
            PixelFX.bitmap(ctx, rows: teardrop, topLeft: CGPoint(x: 85, y: 142 - 6 * e.sweat), color: rgb(0.55, 0.8, 1, 0.9 * (1 - e.sweat * 0.4)))
        }
        if e.capFlight > 0, e.capFlight < 1 {
            let k = e.capFlight
            let p = CGPoint(x: e.capOrigin.x + e.capSide * 60 * k, y: e.capOrigin.y + 80 * k - 130 * k * k)
            ctx.saveGState(); ctx.translateBy(x: p.x, y: p.y); ctx.rotate(by: k * 14)
            MascotPropDrawing.drawCap(ctx, kind: pose.prop?.kind ?? .vodka)
            ctx.restoreGState()
        }
    }

    /// Effects that stay upright whatever the body does.
    private static func drawWorldEffects(_ ctx: CGContext, _ pose: MascotPose, _ xf: CGAffineTransform) {
        if let vomit = pose.effects.vomit { MascotVomitDrawing.draw(ctx, vomit, mouth: MascotRig.mouth.applying(xf), puddleX: MascotRig.centerX + pose.shift.x) }
        guard pose.effects.zzz else { return }
        let head = MascotRig.headTop.applying(xf)
        for i in 0..<3 {
            let phase = (pose.time * 0.55 + CGFloat(i) / 3).truncatingRemainder(dividingBy: 1)
            let origin = CGPoint(x: head.x + 8 + phase * 22 + sin(phase * 9) * 3, y: head.y + 4 + phase * 34)
            PixelFX.bitmap(ctx, rows: letterZ, topLeft: origin, scale: phase < 0.45 ? 1 : 2, color: rgb(0.25, 0.4, 0.85, 1 - phase))
        }
    }
}

/// Eyelids and the open mouth painted over the photographic face. The face only blinks (or sleeps);
/// the mouth opens just for spitting and being sick.
enum MascotFaceOverlay {
    static func draw(_ ctx: CGContext, _ f: Face, blink: Bool) {
        let cell = PixelFX.cell, grid = PixelFX.bodyGrid
        ctx.saveGState()
        ctx.setShouldAntialias(false)
        if blink || f.eyesClosed {
            for side in [Side.left, .right] {
                let e = MascotRig.eyes[side]!
                PixelFX.ellipse(ctx, center: CGPoint(x: e.x, y: e.y + 0.4), rx: 6.5, ry: 3.6, origin: grid, color: Palette.skinLid)
                PixelFX.fill(ctx, bounds: CGRect(x: e.x - 5, y: e.y - 0.9, width: 10, height: cell), origin: grid, color: Palette.lash) { p in
                    abs(p.x - e.x) <= 5 && abs(p.y - (e.y - 0.3)) <= cell * 0.6
                }
            }
        }
        if f.mouthOpen > 0.08 {
            let mouth = MascotRig.mouth
            let w = 15 + 7 * f.mouthOpen, h = 2.2 + 8.5 * f.mouthOpen
            let c = CGPoint(x: mouth.x, y: mouth.y - 0.5)
            PixelFX.ellipse(ctx, center: c, rx: w / 2, ry: h / 2, origin: grid, color: Palette.mouthDark)
            if f.mouthOpen > 0.7 {
                PixelFX.fill(ctx, bounds: CGRect(x: c.x - w / 2 + 2.5, y: c.y + h / 2 - 3, width: w - 5, height: cell * 1.5), origin: grid, color: Palette.teeth) { p in
                    abs(p.x - c.x) <= w / 2 - 2.5 && p.y >= c.y + h / 2 - 3 && p.y <= c.y + h / 2 - 3 + cell * 1.5
                }
            }
        }
        ctx.restoreGState()
    }
}
