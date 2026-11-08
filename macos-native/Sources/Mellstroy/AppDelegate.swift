import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let mascot = MascotController()
    private let watcher = SystemWatcher()
    private let bubble = BubbleController()
    private var statusItem: NSStatusItem?

    private static let actions: [(title: String, kind: Performance.Kind)] = [
        ("Сесть на пол", .sit),
        ("Спать", .sleep),
        ("Разминка и растяжка", .stretch),
        ("Выпить чекушку (0,2 л)", .vodka),
        ("Выпить пиво (0,5 л)", .beer),
        ("Плюнуть в экран", .spit),
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        mascot.onClick = { [weak self] in
            guard let self else { return }
            self.bubble.show("Учись, учись ты еблан конченный", following: { [weak self] in self?.mascot.frame ?? .zero })
        }
        mascot.start()

        watcher.onEvent = { [weak self] event in self?.handle(event) }
        watcher.start()
        setupStatusItem()
        startDemoIfRequested()
    }

    /// Developer aid: `Mellstroy --demo vodka|beer|sit|sleep|stretch|spit` starts that action right after launch.
    private func startDemoIfRequested() {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--demo"), i + 1 < args.count else { return }
        let names: [String: Performance.Kind] = ["sit": .sit, "sleep": .sleep, "stretch": .stretch, "vodka": .vodka, "beer": .beer, "spit": .spit]
        guard let kind = names[args[i + 1]] else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.mascot.trigger(kind) }
    }

    func applicationWillTerminate(_ notification: Notification) { watcher.stop(); mascot.stop() }

    private func handle(_ event: SystemEvent) {
        mascot.react(to: event)
    }

    // MARK: Menu bar

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "🍾"
        let menu = NSMenu()
        for (index, action) in Self.actions.enumerated() {
            let entry = menu.addItem(withTitle: action.title, action: #selector(runAction(_:)), keyEquivalent: "")
            entry.target = self
            entry.tag = index
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "Выход", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    @objc private func runAction(_ sender: NSMenuItem) {
        guard Self.actions.indices.contains(sender.tag) else { return }
        mascot.trigger(Self.actions[sender.tag].kind)
    }
}
