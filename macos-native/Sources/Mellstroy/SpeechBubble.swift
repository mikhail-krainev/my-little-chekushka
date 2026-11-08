import AppKit

/// Cartoon speech bubble with a tail. Click on the mascot shows "...", system events show a short caption.
private final class BubbleView: NSView {
    static let font = NSFont.monospacedSystemFont(ofSize: 13, weight: .bold)
    static let tailHeight: CGFloat = 9
    static let padding = CGSize(width: 14, height: 8)

    var text = "..." { didSet { needsDisplay = true } }
    var tailAtBottom = true { didSet { needsDisplay = true } }
    var tailX: CGFloat = 0 { didSet { needsDisplay = true } }

    override var isFlipped: Bool { false }

    static func textAttributes() -> [NSAttributedString.Key: Any] {
        [.font: font, .foregroundColor: NSColor(calibratedRed: 0.13, green: 0.10, blue: 0.10, alpha: 1)]
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let body = bounds.insetBy(dx: 1.5, dy: 1.5)
            .divided(atDistance: Self.tailHeight, from: tailAtBottom ? .minYEdge : .maxYEdge).remainder
        let path = CGMutablePath()
        path.addRoundedRect(in: body, cornerWidth: 12, cornerHeight: 12)
        let tx = min(max(tailX, body.minX + 18), body.maxX - 18)
        let baseY = tailAtBottom ? body.minY : body.maxY
        let tipY = tailAtBottom ? body.minY - Self.tailHeight + 1 : body.maxY + Self.tailHeight - 1
        path.move(to: CGPoint(x: tx - 6, y: baseY))
        path.addLine(to: CGPoint(x: tx, y: tipY))
        path.addLine(to: CGPoint(x: tx + 6, y: baseY))
        path.closeSubpath()
        ctx.setFillColor(NSColor.white.cgColor); ctx.addPath(path); ctx.fillPath()
        ctx.setStrokeColor(rgb(0.2, 0.2, 0.24)); ctx.setLineWidth(2); ctx.setLineJoin(.round); ctx.addPath(path); ctx.strokePath()
        // hide the outline where the tail joins the body
        ctx.setStrokeColor(NSColor.white.cgColor); ctx.setLineWidth(2.4)
        ctx.move(to: CGPoint(x: tx - 5, y: baseY)); ctx.addLine(to: CGPoint(x: tx + 5, y: baseY)); ctx.strokePath()

        let str = NSAttributedString(string: text, attributes: Self.textAttributes())
        let rect = body.insetBy(dx: Self.padding.width, dy: Self.padding.height)
        str.draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
    }
}

/// Shows the bubble above the mascot and keeps it glued to the mascot while it walks, jumps or is dragged.
final class BubbleController {
    private let panel: NSPanel
    private let view = BubbleView()
    private var hideTimer: Timer?
    private var followTimer: Timer?
    private var anchor: (() -> CGRect)?
    private var size = CGSize.zero

    init() {
        panel = NSPanel(contentRect: CGRect(x: 0, y: 0, width: 60, height: 40), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false
        panel.ignoresMouseEvents = true
        panel.contentView = view
    }

    /// `mascot` is queried every frame, so the bubble moves with the mascot until it disappears.
    func show(_ text: String, following mascot: @escaping () -> CGRect, duration: TimeInterval = Config.bubbleDuration) {
        view.text = text
        let textSize = NSAttributedString(string: text, attributes: BubbleView.textAttributes())
            .boundingRect(with: CGSize(width: Config.bubbleMaxTextWidth, height: 200), options: [.usesLineFragmentOrigin]).size
        size = CGSize(width: max(52, ceil(textSize.width) + 2 * BubbleView.padding.width + 3),
                      height: ceil(textSize.height) + 2 * BubbleView.padding.height + BubbleView.tailHeight + 3)
        anchor = mascot
        place()
        panel.orderFrontRegardless()
        startFollowing()
        hideTimer?.invalidate()
        hideTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in self?.hide() }
    }

    func hide() {
        hideTimer?.invalidate(); followTimer?.invalidate()
        followTimer = nil; anchor = nil
        panel.orderOut(nil)
    }

    private func startFollowing() {
        guard followTimer == nil else { return }
        let timer = Timer(timeInterval: Config.tickInterval, repeats: true) { [weak self] _ in self?.place() }
        RunLoop.main.add(timer, forMode: .common)
        followTimer = timer
    }

    /// Puts the bubble above the mascot (below it when there is no room) and points the tail at it.
    private func place() {
        guard let mascot = anchor?() else { return }
        let screen = (NSScreen.screens.first { $0.frame.intersects(mascot) } ?? NSScreen.main)?.visibleFrame ?? .zero
        var origin = CGPoint(x: mascot.midX - size.width / 2, y: mascot.maxY + 2)
        let above = origin.y + size.height <= screen.maxY
        if !above { origin.y = mascot.minY - size.height - 2 }
        origin.x = max(screen.minX, min(screen.maxX - size.width, origin.x))
        origin.y = max(screen.minY, origin.y)
        view.tailAtBottom = above
        view.tailX = mascot.midX - origin.x
        panel.setFrame(CGRect(origin: origin, size: size), display: true)
        view.frame = CGRect(origin: .zero, size: size)
    }
}
