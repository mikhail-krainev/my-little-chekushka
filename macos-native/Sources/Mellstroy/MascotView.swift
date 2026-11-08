import AppKit

/// Draws the mascot and turns mouse input into hover / click / drag / throw callbacks.
final class MascotView: NSView {
    var pose = MascotPose() { didSet { needsDisplay = true } }

    var onHover: ((Bool) -> Void)?
    var onClick: (() -> Void)?
    var onDragBegan: (() -> Void)?
    var onDragMoved: ((CGPoint) -> Void)?          // global mouse location
    var onDragEnded: ((CGVector) -> Void)?         // throw velocity, points/sec

    private var mouseDownLocation: CGPoint = .zero
    private var isDragging = false
    private var samples: [(time: TimeInterval, point: CGPoint)] = []
    private let dragThreshold: CGFloat = 4
    private let velocityWindow: TimeInterval = 0.1

    override var isFlipped: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds.insetBy(dx: Config.spritePad, dy: Config.spritePad), options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    }

    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }

    override func mouseDown(with event: NSEvent) {
        mouseDownLocation = NSEvent.mouseLocation
        isDragging = false
        samples = [(event.timestamp, mouseDownLocation)]
    }

    override func mouseDragged(with event: NSEvent) {
        let p = NSEvent.mouseLocation
        if !isDragging {
            guard hypot(p.x - mouseDownLocation.x, p.y - mouseDownLocation.y) > dragThreshold else { return }
            isDragging = true
            onDragBegan?()
        }
        samples.append((event.timestamp, p))
        samples.removeAll { event.timestamp - $0.time > velocityWindow }
        onDragMoved?(p)
    }

    override func mouseUp(with event: NSEvent) {
        guard isDragging else { onClick?(); return }
        isDragging = false
        var v = CGVector.zero
        if let first = samples.first, let last = samples.last, last.time - first.time > 0.01 {
            let dt = CGFloat(last.time - first.time)
            v = CGVector(dx: (last.point.x - first.point.x) / dt, dy: (last.point.y - first.point.y) / dt)
        }
        onDragEnded?(v)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.translateBy(x: Config.spritePad, y: Config.spritePad)
        ctx.scaleBy(x: Config.spriteScale, y: Config.spriteScale)
        MascotRenderer.draw(pose, in: ctx)
        ctx.restoreGState()
    }
}
