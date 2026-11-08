import AppKit
import CoreServices

/// Watches files (FSEvents), opened files (Spotlight last-used date) and app launches (NSWorkspace).
final class SystemWatcher {
    var onEvent: ((SystemEvent) -> Void)?

    private var stream: FSEventStreamRef?
    private var metadataQuery: NSMetadataQuery?
    private var lastSeen: [String: Date] = [:]
    private var observers: [NSObjectProtocol] = []
    private let debounce: TimeInterval = 1.5
    private let openedDebounce: TimeInterval = 30

    static let watchedFolders: [String] = ["Desktop", "Documents", "Downloads"].map {
        (NSHomeDirectory() as NSString).appendingPathComponent($0)
    }

    func start() {
        startFileEvents()
        startOpenedFiles()
        startApps()
    }

    func stop() {
        if let s = stream { FSEventStreamStop(s); FSEventStreamInvalidate(s); FSEventStreamRelease(s); stream = nil }
        metadataQuery?.stop(); metadataQuery = nil
        observers.forEach { NSWorkspace.shared.notificationCenter.removeObserver($0); NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
    }

    // MARK: Create / delete / rename

    private func startFileEvents() {
        let existing = Self.watchedFolders.filter { FileManager.default.fileExists(atPath: $0) }
        guard !existing.isEmpty else { return }
        var ctx = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, count, paths, flags, _ in
            guard let info = info else { return }
            let me = Unmanaged<SystemWatcher>.fromOpaque(info).takeUnretainedValue()
            let list = unsafeBitCast(paths, to: NSArray.self) as? [String] ?? []
            for i in 0..<count { me.handleFS(path: list[i], flags: flags[i]) }
        }
        let flags = UInt32(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)
        guard let s = FSEventStreamCreate(nil, callback, &ctx, existing as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.3, flags) else {
            NSLog("Mellstroy: FSEventStreamCreate failed"); return
        }
        FSEventStreamSetDispatchQueue(s, .main)
        FSEventStreamStart(s)
        stream = s
    }

    fileprivate func handleFS(path: String, flags: FSEventStreamEventFlags) {
        let name = (path as NSString).lastPathComponent
        guard !name.hasPrefix("."), !name.hasSuffix(".crdownload"), !name.hasSuffix(".download") else { return }
        guard !isDuplicate(path, window: debounce) else { return }
        let f = Int(flags)
        let exists = FileManager.default.fileExists(atPath: path)
        if f & kFSEventStreamEventFlagItemRemoved != 0 || (f & kFSEventStreamEventFlagItemRenamed != 0 && !exists) {
            onEvent?(.fileDeleted(name))
        } else if f & kFSEventStreamEventFlagItemCreated != 0 || (f & kFSEventStreamEventFlagItemRenamed != 0 && exists) {
            onEvent?(.fileCreated(name))
        }
    }

    // MARK: Opened files (best effort: Spotlight updates kMDItemLastUsedDate with a delay)

    private func startOpenedFiles() {
        let q = NSMetadataQuery()
        q.searchScopes = [NSMetadataQueryUserHomeScope]
        q.predicate = NSPredicate(format: "%K >= %@", NSMetadataItemLastUsedDateKey, Date() as NSDate)
        q.notificationBatchingInterval = 1
        let obs = NotificationCenter.default.addObserver(forName: .NSMetadataQueryDidUpdate, object: q, queue: .main) { [weak self] note in
            guard let self else { return }
            let items = (note.userInfo?[NSMetadataQueryUpdateAddedItemsKey] as? [NSMetadataItem] ?? []) +
                        (note.userInfo?[NSMetadataQueryUpdateChangedItemsKey] as? [NSMetadataItem] ?? [])
            for item in items {
                guard let path = item.value(forAttribute: NSMetadataItemPathKey) as? String,
                      !path.contains("/Library/"), !path.contains("/."), !path.hasSuffix(".app") else { continue }
                if self.isDuplicate(path, window: self.openedDebounce) { continue }
                self.onEvent?(.fileOpened((path as NSString).lastPathComponent))
            }
        }
        observers.append(obs)
        q.start()
        metadataQuery = q
    }

    // MARK: Apps

    private func startApps() {
        let center = NSWorkspace.shared.notificationCenter
        let name = { (note: Notification) -> String? in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.activationPolicy == .regular else { return nil }
            return app.localizedName
        }
        observers.append(center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] n in
            if let app = name(n) { self?.onEvent?(.appLaunched(app)) }
        })
        observers.append(center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] n in
            if let app = name(n) { self?.onEvent?(.appQuit(app)) }
        })
    }

    private func isDuplicate(_ key: String, window: TimeInterval) -> Bool {
        let now = Date()
        if let last = lastSeen[key], now.timeIntervalSince(last) < window { return true }
        lastSeen[key] = now
        if lastSeen.count > 500 { lastSeen = lastSeen.filter { now.timeIntervalSince($0.value) < 60 } }
        return false
    }
}
