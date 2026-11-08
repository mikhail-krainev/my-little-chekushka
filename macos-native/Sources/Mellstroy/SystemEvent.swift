import Foundation

/// Things the user does in the system that the mascot reacts to.
enum SystemEvent: Equatable {
    case fileCreated(String)
    case fileDeleted(String)
    case fileOpened(String)
    case appLaunched(String)
    case appQuit(String)

    var emote: Emote {
        switch self {
        case .fileCreated: return .excited
        case .fileDeleted: return .sad
        case .fileOpened: return .surprised
        case .appLaunched: return .happy
        case .appQuit: return .sleepy
        }
    }

    var caption: String {
        switch self {
        case .fileCreated(let n): return "Новый файл: \(n)"
        case .fileDeleted(let n): return "Удалено: \(n)"
        case .fileOpened(let n): return "Открыт: \(n)"
        case .appLaunched(let n): return "Запущено: \(n)"
        case .appQuit(let n): return "Закрыто: \(n)"
        }
    }
}

enum Emote: Equatable { case neutral, happy, excited, sad, surprised, sleepy }
