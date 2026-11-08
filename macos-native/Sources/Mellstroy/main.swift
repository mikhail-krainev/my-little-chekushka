import AppKit

// Developer tool: render pose sheets to PNG and exit (see PoseSheet).
if PoseSheet.runIfRequested(CommandLine.arguments) { exit(0) }

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)   // no Dock icon, menu-bar only
app.run()
