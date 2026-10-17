import XCTest
let suite = NativeQAHistoryPresentationTests.defaultTestSuite
suite.run()
guard let result = suite.testRun, result.executionCount == 7, result.totalFailureCount == 0 else {
    fatalError("Synthetic history suite failed or did not execute seven tests")
}
print("SYNTHETIC ONLY: \(result.executionCount) tests, \(result.totalFailureCount) failures")
