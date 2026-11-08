import Testing
import Foundation
@testable import Mellstroy

@Suite struct ShatterWorldTests {
    private func world(seed: UInt64 = 7) -> ShatterWorld {
        ShatterWorld(floor: 0, bounds: CGRect(x: 0, y: 0, width: 1600, height: 900), seed: seed)
    }

    private func runUntilImpact(_ w: inout ShatterWorld) {
        for _ in 0..<600 where !w.bottles.isEmpty { w.step(1.0 / 60) }
    }

    @Test func bottleFallsAndShattersIntoShards() {
        var w = world()
        w.throwBottle(.vodka, from: CGPoint(x: 400, y: 120), velocity: CGVector(dx: 500, dy: 400))
        #expect(w.bottles.count == 1)
        runUntilImpact(&w)
        #expect(w.bottles.isEmpty)
        #expect(w.shards.count >= 20)
    }

    @Test func shardsScatterAcrossTheDesktop() {
        var w = world()
        w.throwBottle(.beer, from: CGPoint(x: 400, y: 120), velocity: CGVector(dx: 500, dy: 400))
        runUntilImpact(&w)
        for _ in 0..<120 { w.step(1.0 / 60) }
        let xs = w.shards.map(\.pos.x)
        #expect((xs.max() ?? 0) - (xs.min() ?? 0) > 250, "shards must fly apart, not pile up")
    }

    @Test func shardsStayOnScreenAndAboveFloor() {
        var w = world()
        w.throwBottle(.vodka, from: CGPoint(x: 30, y: 300), velocity: CGVector(dx: -600, dy: 300))
        runUntilImpact(&w)
        for _ in 0..<200 {
            w.step(1.0 / 60)
            for s in w.shards {
                #expect(s.pos.x >= 0 && s.pos.x <= 1600)
                #expect(s.pos.y >= 0)
            }
        }
    }

    @Test func shardsVanishFiveSecondsAfterImpact() {
        var w = world()
        w.throwBottle(.vodka, from: CGPoint(x: 400, y: 120), velocity: CGVector(dx: 500, dy: 400))
        runUntilImpact(&w)
        for _ in 0..<(4 * 60) { w.step(1.0 / 60) }                       // ~4 s after impact: still there, fully opaque
        #expect(!w.shards.isEmpty)
        #expect(abs((w.shards.map(\.alpha).min() ?? 0) - 1) < 0.001)
        for _ in 0..<(2 * 60) { w.step(1.0 / 60) }                       // ~6 s after impact: gone
        #expect(w.isEmpty)
    }

    @Test func spitFliesToTheTargetAndLeavesASplat() {
        var w = world()
        let target = CGPoint(x: 1200, y: 700)
        w.launchSpit(from: CGPoint(x: 300, y: 100), to: target)
        #expect(w.spits.count == 1)
        for _ in 0..<180 where !w.spits.isEmpty { w.step(1.0 / 60) }
        #expect(w.spits.isEmpty)
        #expect(w.splats.count == 1)
        #expect(w.splats.first?.pos == target)
    }

    @Test func splatDripsAndThenDisappears() {
        var w = world()
        w.launchSpit(from: CGPoint(x: 300, y: 100), to: CGPoint(x: 800, y: 500))
        for _ in 0..<180 where !w.spits.isEmpty { w.step(1.0 / 60) }
        for _ in 0..<60 { w.step(1.0 / 60) }
        let splat = w.splats[0]
        #expect(splat.drips.contains { splat.dripLength($0) > 1 })
        for _ in 0..<(6 * 60) { w.step(1.0 / 60) }
        #expect(w.isEmpty)
    }
}
