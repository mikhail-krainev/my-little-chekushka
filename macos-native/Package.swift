// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Mellstroy",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "Mellstroy", path: "Sources/Mellstroy", resources: [.process("Resources")]),
        .testTarget(name: "MellstroyTests", dependencies: ["Mellstroy"], path: "Tests/MellstroyTests"),
    ]
)
