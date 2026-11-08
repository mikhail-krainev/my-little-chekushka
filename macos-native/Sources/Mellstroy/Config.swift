import AppKit

/// Central, tunable constants. No magic numbers elsewhere.
enum Config {
    // MARK: Mascot geometry (logical sprite units are MascotRig.size, scaled to points here)
    static let spriteScale: CGFloat = 0.85
    static let spriteSize = CGSize(width: MascotRig.size.width * spriteScale, height: MascotRig.size.height * spriteScale)
    /// Transparent margin around the sprite: room for outstretched arms, the lying pose and swinging on the cursor.
    static let spritePad: CGFloat = 56
    /// One art pixel on screen, so effects drawn outside the mascot window match its pixel size.
    static let pixelSize: CGFloat = PixelFX.cell * spriteScale
    static let mascotSize = CGSize(width: spriteSize.width + 2 * spritePad, height: spriteSize.height + 2 * spritePad)

    // MARK: Motion
    static let hangDuration: TimeInterval = 12
    static let tickInterval: TimeInterval = 1.0 / 60.0
    static let gravity: CGFloat = 1800
    static let walkSpeed: CGFloat = 75
    static let runSpeed: CGFloat = 230
    static let throwVelocityCap: CGFloat = 2400
    static let crouchDuration: TimeInterval = 0.22
    static let landDuration: TimeInterval = 0.32

    // MARK: Broken glass
    /// Shards stay on the desktop this long after the impact, then fade out.
    static let shardLifetime: CGFloat = 5
    static let shardFadeDuration: CGFloat = 0.6

    // MARK: Spit
    /// Spit targets stay this far inside the visible screen edge.
    static let spitScreenMargin: CGFloat = 40

    // MARK: Speech bubble
    static let bubbleDuration: TimeInterval = 2
    static let bubbleMaxTextWidth: CGFloat = 260
}
