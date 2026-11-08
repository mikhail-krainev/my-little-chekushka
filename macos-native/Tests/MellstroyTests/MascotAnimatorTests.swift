import Testing
import Foundation
@testable import Mellstroy

@Suite struct MascotAnimatorTests {
    @Test func armKeepsItsLengthWhateverTheTarget() {
        for side in [Side.left, .right] {
            let shoulder = MascotRig.shoulder[side]!
            for target in [CGPoint(x: 60, y: 98), CGPoint(x: 300, y: 300), shoulder] {
                let sol = MascotRig.solveArm(side, target: target)
                let upper = hypot(sol.elbow.x - sol.shoulder.x, sol.elbow.y - sol.shoulder.y)
                let fore = hypot(sol.hand.x - sol.elbow.x, sol.hand.y - sol.elbow.y)
                #expect(abs(upper - MascotRig.upperArm) < 0.01)
                #expect(abs(fore - MascotRig.foreArm) < 0.01)
            }
        }
    }

    @Test func scenesReleaseTheirItemBeforeTheyEnd() {
        for kind in [Performance.Kind.vodka, .beer, .spit] {
            for vomits in [false, true] {
                let perf = Performance.make(kind, side: 1, vomits: vomits)
                let release = MascotAnimator.releaseTime(perf)
                #expect(release != nil)
                #expect(Double(release ?? 99) < perf.duration)
            }
        }
        #expect(MascotAnimator.releaseTime(Performance.make(.sit, side: 1)) == nil)
    }

    @Test func bottleIsInHandOnlyUntilTheThrow() {
        for kind in [Performance.Kind.vodka, .beer] {
            for vomits in [false, true] {
                let perf = Performance.make(kind, side: 1, vomits: vomits)
                let release = MascotAnimator.releaseTime(perf) ?? 0
                #expect(MascotAnimator.performance(perf, time: 0.1, base: Face()).prop == nil)
                #expect(MascotAnimator.performance(perf, time: release - 0.1, base: Face()).prop != nil)
                #expect(MascotAnimator.performance(perf, time: release + 0.1, base: Face()).prop == nil)
            }
        }
    }

    @Test func vomitingOnlyHappensWhenTheDrinkerIsSick() {
        for kind in [Performance.Kind.vodka, .beer] {
            let tl = MascotAnimator.drinkTimeline(kind == .beer ? .beer : .vodka, vomits: true)
            let sick = Performance.make(kind, side: 1, vomits: true), fine = Performance.make(kind, side: 1, vomits: false)
            let mid = tl.swayEnd + 1.8
            #expect(MascotAnimator.performance(sick, time: mid, base: Face()).effects.vomit != nil)
            #expect(MascotAnimator.performance(fine, time: mid, base: Face()).effects.vomit == nil)
            #expect(sick.duration > fine.duration)
        }
        #expect(Performance.make(.sit, side: 1, vomits: true).vomits == false)
    }

    @Test func vomitChanceIsHalf() {
        var rng = SplitMix64(seed: 5)
        let sick = (0..<2000).filter { _ in Double.random(in: 0..<1, using: &rng) < Performance.vomitChance }.count
        #expect(abs(Double(sick) / 2000 - 0.5) < 0.05)
    }

    @Test func faceOnlyBlinksAndOnlyOpensItsMouthWhenSpitting() {
        // sit, stretch, drinking before the vomit: the mouth stays shut, the eyes open
        let calm: [Performance] = [Performance(kind: .sit, duration: 6, side: 1), Performance(kind: .stretch, duration: MascotAnimator.stretchDuration, side: 1),
                                   Performance.make(.vodka, side: 1, vomits: false)]
        for perf in calm {
            for t in stride(from: 0.0, to: perf.duration, by: 0.25) {
                let face = MascotAnimator.performance(perf, time: CGFloat(t), base: Face()).face
                #expect(face.mouthOpen == 0)
                #expect(!face.eyesClosed)
            }
        }
        let spit = Performance.make(.spit, side: 1)
        #expect(MascotAnimator.performance(spit, time: 1.7, base: Face()).face.mouthOpen > 0.2)
    }

    @Test func sleepClosesTheEyes() {
        let perf = Performance(kind: .sleep, duration: 12, side: 1)
        #expect(MascotAnimator.performance(perf, time: 6, base: Face()).face.eyesClosed)
        #expect(!MascotAnimator.performance(perf, time: 0.2, base: Face()).face.eyesClosed)
    }

    @Test func bottleIsEmptyAfterDrinking() {
        let tl = MascotAnimator.drinkTimeline(.vodka)
        let perf = Performance.make(.vodka, side: 1)
        let full = MascotAnimator.performance(perf, time: tl.raise - 0.05, base: Face()).prop
        let empty = MascotAnimator.performance(perf, time: tl.lowerEnd + 0.1, base: Face()).prop
        #expect(abs((full?.fill ?? 0) - 1) < 0.001)
        #expect(abs(empty?.fill ?? 1) < 0.001)
    }

    @Test func beerTakesLongerThanVodka() {
        #expect(MascotAnimator.drinkTimeline(.beer).end > MascotAnimator.drinkTimeline(.vodka).end)
    }

    @Test func sleepLiesOnItsSideAndEndsStanding() {
        let perf = Performance(kind: .sleep, duration: 12, side: 1)
        #expect(abs(MascotAnimator.performance(perf, time: 12, base: Face()).tilt) < 0.05)
        let mid = MascotAnimator.performance(perf, time: 6, base: Face())
        #expect(abs(mid.tilt) > 1.4)
        #expect(mid.effects.zzz)
    }

    @Test func sittingLowersTheBodyAndComesBackUp() {
        let perf = Performance(kind: .sit, duration: 6, side: 1)
        #expect(MascotAnimator.performance(perf, time: 3, base: Face()).shift.y < -15)
        #expect(abs(MascotAnimator.performance(perf, time: 6, base: Face()).shift.y) < 0.5)
    }
}
