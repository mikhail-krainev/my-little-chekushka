import AppKit

/// Maps reference-picture pixels (y down, bottle centre x = 241, shoe soles y = 581) to sprite units (y up).
enum RefMap {
    static let scale: CGFloat = 0.409
    static let centerX: CGFloat = 241
    static let groundY: CGFloat = 581
    static func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: (x - centerX) * scale + MascotRig.centerX, y: (groundY - y) * scale)
    }
    static func mirroredX(_ x: CGFloat) -> CGFloat { 2 * centerX - x }
}

/// One pixel-art piece cut from the reference by `tools/make_sprites.py`. Rects are in reference pixels.
struct SpritePart {
    let image: CGImage
    let rect: CGRect
    /// Joint the piece rotates about, in reference pixels.
    let pivot: CGPoint

    init?(name: String, rect: CGRect, pivot: CGPoint) {
        guard let url = Bundle.module.url(forResource: name, withExtension: "png"),
              let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
            NSLog("Mellstroy: missing sprite \(name).png")
            return nil
        }
        image = img; self.rect = rect; self.pivot = pivot
    }

    /// Draws the piece with its pivot at `anchor` (sprite units), rotated counter-clockwise by `angle`.
    func draw(_ ctx: CGContext, anchor: CGPoint, angle: CGFloat) {
        let k = RefMap.scale
        ctx.saveGState()
        ctx.translateBy(x: anchor.x, y: anchor.y)
        ctx.rotate(by: angle)
        ctx.interpolationQuality = .none
        ctx.draw(image, in: CGRect(x: (rect.minX - pivot.x) * k, y: (pivot.y - rect.maxY) * k, width: rect.width * k, height: rect.height * k))
        ctx.restoreGState()
    }
}

enum MascotSprites {
    static let body = SpritePart(name: "body", rect: CGRect(x: 117, y: 135, width: 243, height: 390), pivot: CGPoint(x: 241, y: 581))

    static func upperArm(_ side: Side) -> SpritePart? {
        side == .left
            ? SpritePart(name: "armL_up", rect: CGRect(x: 120, y: 353, width: 51, height: 93), pivot: CGPoint(x: 163, y: 380))
            : SpritePart(name: "armR_up", rect: CGRect(x: 312, y: 353, width: 51, height: 93), pivot: CGPoint(x: 319, y: 380))
    }

    static func foreArm(_ side: Side) -> SpritePart? {
        side == .left
            ? SpritePart(name: "armL_low", rect: CGRect(x: 120, y: 440, width: 51, height: 72), pivot: CGPoint(x: 143, y: 442))
            : SpritePart(name: "armR_low", rect: CGRect(x: 312, y: 440, width: 51, height: 72), pivot: CGPoint(x: 339, y: 442))
    }

    static func leg(_ side: Side) -> SpritePart? {
        side == .left
            ? SpritePart(name: "legL", rect: CGRect(x: 162, y: 513, width: 69, height: 72), pivot: CGPoint(x: 196, y: 520))
            : SpritePart(name: "legR", rect: CGRect(x: 255, y: 513, width: 75, height: 72), pivot: CGPoint(x: 293, y: 520))
    }

    // Loaded once; a missing file is logged and the part is skipped.
    static let upperArms: [Side: SpritePart] = Dictionary(uniqueKeysWithValues: [Side.left, .right].compactMap { s in upperArm(s).map { (s, $0) } })
    static let foreArms: [Side: SpritePart] = Dictionary(uniqueKeysWithValues: [Side.left, .right].compactMap { s in foreArm(s).map { (s, $0) } })
    static let legs: [Side: SpritePart] = Dictionary(uniqueKeysWithValues: [Side.left, .right].compactMap { s in leg(s).map { (s, $0) } })
    static let bodyPart: SpritePart? = body
}
