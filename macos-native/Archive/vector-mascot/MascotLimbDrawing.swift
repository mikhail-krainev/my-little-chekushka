import AppKit

/// Legs, shoes, sleeves, arms and hands.
enum MascotLimbDrawing {
    private static func capsule(_ ctx: CGContext, _ a: CGPoint, _ b: CGPoint, width: CGFloat, color: CGColor) {
        ctx.setStrokeColor(color); ctx.setLineWidth(width); ctx.setLineCap(.round)
        ctx.move(to: a); ctx.addLine(to: b); ctx.strokePath()
    }

    static func ankle(_ pose: MascotPose, _ side: Side) -> CGPoint {
        let rest = MascotRig.restAnkle[side]!, off = pose.feet[side]?.offset ?? .zero
        return CGPoint(x: rest.x + off.x, y: rest.y + off.y)
    }

    // MARK: Legs

    static func drawLeg(_ ctx: CGContext, _ pose: MascotPose, _ side: Side) {
        let hip = MascotRig.hip[side]!, ank = ankle(pose, side)
        capsule(ctx, hip, ank, width: 16, color: Palette.pants)
        capsule(ctx, CGPoint(x: hip.x - 3 * side.sign, y: hip.y), CGPoint(x: ank.x - 3 * side.sign, y: ank.y + 1), width: 3, color: rgb(0.2, 0.2, 0.22, 0.7))
        drawShoe(ctx, at: ank, side: side, toeUp: pose.feet[side]?.toeUp ?? 0)
    }

    /// Black sneaker with a thick white sole, toe pointing outward (as on the reference).
    private static func drawShoe(_ ctx: CGContext, at p: CGPoint, side: Side, toeUp: CGFloat) {
        ctx.saveGState()
        ctx.translateBy(x: p.x, y: p.y)
        ctx.scaleBy(x: side.sign, y: 1)                  // built for the right foot
        ctx.rotate(by: toeUp - 0.08)
        let body = CGMutablePath()
        body.move(to: CGPoint(x: -10.5, y: -5))
        body.addCurve(to: CGPoint(x: -7, y: 4.5), control1: CGPoint(x: -12.5, y: -1), control2: CGPoint(x: -10, y: 4))
        body.addLine(to: CGPoint(x: 5, y: 4.5))
        body.addCurve(to: CGPoint(x: 15.5, y: -3), control1: CGPoint(x: 11, y: 4), control2: CGPoint(x: 16.5, y: 1.5))
        body.addLine(to: CGPoint(x: 15, y: -5.5))
        body.addLine(to: CGPoint(x: -10.5, y: -5.5))
        body.closeSubpath()
        // sole
        let sole = CGPath(roundedRect: CGRect(x: -12, y: -10, width: 29, height: 5.6), cornerWidth: 2.6, cornerHeight: 2.6, transform: nil)
        ctx.setFillColor(rgb(0.93, 0.93, 0.92)); ctx.addPath(sole); ctx.fillPath()
        ctx.setStrokeColor(rgb(0.45, 0.45, 0.48)); ctx.setLineWidth(0.6); ctx.addPath(sole); ctx.strokePath()
        ctx.setStrokeColor(rgb(0.7, 0.7, 0.72)); ctx.setLineWidth(0.5)
        ctx.move(to: CGPoint(x: -10, y: -7.8)); ctx.addLine(to: CGPoint(x: 15, y: -7.8)); ctx.strokePath()
        // upper
        ctx.setFillColor(rgb(0.07, 0.07, 0.08)); ctx.addPath(body); ctx.fillPath()
        ctx.setStrokeColor(rgb(0.30, 0.30, 0.33)); ctx.setLineWidth(0.7); ctx.addPath(body); ctx.strokePath()
        // laces
        ctx.setStrokeColor(rgb(0.78, 0.78, 0.80)); ctx.setLineWidth(0.7)
        for x in [3.0, 6.5, 10.0] as [CGFloat] { ctx.move(to: CGPoint(x: x, y: 3.6 - x * 0.12)); ctx.addLine(to: CGPoint(x: x + 1.6, y: 1.2 - x * 0.12)); ctx.strokePath() }
        // shine
        ctx.setFillColor(rgb(1, 1, 1, 0.22)); ctx.fillEllipse(in: CGRect(x: 6.5, y: -1.8, width: 6, height: 2))
        // ankle collar
        ctx.setFillColor(rgb(0.25, 0.25, 0.28)); ctx.fill(CGRect(x: -7, y: 3.4, width: 12, height: 1.6))
        ctx.restoreGState()
    }

    // MARK: Arms

    static func drawArm(_ ctx: CGContext, _ pose: MascotPose, _ side: Side) {
        let sol = MascotRig.solveArm(side, target: pose.hands[side] ?? MascotRig.restHand[side]!)
        // skin, then the short sleeve over its upper end
        capsule(ctx, sol.shoulder, sol.elbow, width: 9, color: Palette.skinArm)
        capsule(ctx, sol.elbow, sol.hand, width: 8.2, color: Palette.skinArm)
        ctx.setStrokeColor(rgb(0.7, 0.5, 0.45, 0.4)); ctx.setLineWidth(0.6)
        ctx.move(to: sol.elbow); ctx.addLine(to: CGPoint(x: lerp(sol.elbow.x, sol.hand.x, 0.8), y: lerp(sol.elbow.y, sol.hand.y, 0.8))); ctx.strokePath()
        let sleeveEnd = CGPoint(x: lerp(sol.shoulder.x, sol.elbow.x, 0.42), y: lerp(sol.shoulder.y, sol.elbow.y, 0.42))
        let start = CGPoint(x: sol.shoulder.x + side.sign * 1, y: sol.shoulder.y + 0.5)
        capsule(ctx, start, sleeveEnd, width: 13, color: Palette.shirt)
        capsule(ctx, CGPoint(x: start.x + side.sign * 1, y: start.y + 3), CGPoint(x: sleeveEnd.x + side.sign * 1, y: sleeveEnd.y + 3), width: 2.4, color: Palette.shirtLight.copy(alpha: 0.5)!)
    }

    static func drawHand(_ ctx: CGContext, _ pose: MascotPose, _ side: Side) {
        let sol = MascotRig.solveArm(side, target: pose.hands[side] ?? MascotRig.restHand[side]!)
        let h = sol.hand
        ctx.setFillColor(Palette.skinArm)
        ctx.fillEllipse(in: CGRect(x: h.x - 5.4, y: h.y - 5.6, width: 10.8, height: 11.2))
        ctx.setStrokeColor(rgb(0.62, 0.42, 0.38, 0.6)); ctx.setLineWidth(0.5)
        for dy in [-1.8, 0.2, 2.2] as [CGFloat] {
            ctx.move(to: CGPoint(x: h.x - 4, y: h.y + dy)); ctx.addLine(to: CGPoint(x: h.x + 2 * side.sign * -1 + 2, y: h.y + dy - 0.2))
        }
        ctx.strokePath()
        // thumb
        ctx.setFillColor(Palette.skinArm)
        ctx.fillEllipse(in: CGRect(x: h.x - side.sign * 5.8 - 2, y: h.y + 0.5, width: 4.2, height: 5.4))
    }
}
