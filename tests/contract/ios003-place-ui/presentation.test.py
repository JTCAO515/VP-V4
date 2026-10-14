"""Run the production presentation decision logic without an App or network."""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
VIEW = ROOT / 'ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift'

class PlacePresentationTests(unittest.TestCase):
    def test_add_decisions_execute_actual_swift(self):
        source = VIEW.read_text()
        logic = source.split('// IOS003_PRESENTATION_BEGIN\n')[1].split('// IOS003_PRESENTATION_END')[0]
        probe = r'''
let start = Date(timeIntervalSince1970: 100)
func check(_ expected: NativePlaceAddAvailability, busy: Bool = false, unresolved: Bool = false,
           days: [String] = ["selected-day"], day: String? = "selected-day", confirmed: Bool = true,
           duration: Double = 3600) {
    let actual = NativePlaceAddAvailability.evaluate(busy: busy, unresolved: unresolved, days: days,
        dayId: day, confirmed: confirmed, start: start, end: start.addingTimeInterval(duration))
    precondition(actual == expected, "Unexpected decision: \(actual) vs \(expected)")
    precondition(!actual.explanation(chinese: true).isEmpty)
    precondition(!actual.explanation(chinese: false).isEmpty)
    precondition(actual.explanation(chinese: true) != actual.explanation(chinese: false))
}
check(.ready)
check(.ready, duration: 86400)
check(.tooLong, duration: 86401)
check(.invalidOrder, duration: 0)
check(.invalidOrder, duration: -1)
check(.confirmWindow, confirmed: false)
check(.chooseDay, day: nil)
check(.chooseDay, day: "other-trip-day")
check(.noDays, days: [])
check(.busy, busy: true)
check(.unresolved, unresolved: true)
check(.unresolved, busy: true, unresolved: true, days: [], day: nil)
check(.busy, busy: true, days: [], day: nil)
// Every state must remain disabled until the original unknown operation is resolved.
for day in [nil, "selected-day", "other-trip-day"] as [String?] {
    for duration in [-1.0, 0, 1, 86400, 86401] {
        for confirmed in [false, true] {
            check(.unresolved, unresolved: true, day: day, confirmed: confirmed, duration: duration)
        }
    }
}
print("PASS: Swift presentation decisions, all bilingual reasons, unknown-result dominance")
'''
        with tempfile.TemporaryDirectory(prefix='ios003-presentation-') as temp:
            path = pathlib.Path(temp)
            (path / 'main.swift').write_text('import Foundation\n' + logic + probe)
            subprocess.run(['xcrun', 'swiftc', str(path / 'main.swift'), '-o', str(path / 'probe')], check=True)
            subprocess.run([str(path / 'probe')], check=True)

    def test_only_presentation_changes_request_pipeline_unchanged(self):
        source = VIEW.read_text()
        baseline = subprocess.check_output(['git', 'show', '8731c54ed45940477672233cb9f96dc2c0996421:ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift'], cwd=ROOT, text=True)
        # Identity, actor/current checks, durable recovery/abandon/retry, request bytes and
        # Proposal construction are retained verbatim from the accepted source.
        self.assertEqual(source.split('    private func loadTrips() async {')[1].split('    private func reload()')[0],
                         baseline.split('    private func loadTrips() async {')[1].split('    private func reload()')[0])
        self.assertEqual(source.split('    @ViewBuilder private func receiptView')[1].split('    private func loadTrips()')[0].replace('操作记录（仍须刷新当前状态）：', '历史操作回执：').replace('Operation record (refresh to check current state): ', 'Historical operation receipt: '),
                         baseline.split('    @ViewBuilder private func receiptView')[1].split('    private func loadTrips()')[0])

    def test_view_identity_expiry_and_fixture_boundaries(self):
        source = VIEW.read_text()
        self.assertIn('refresh: refresh, locale: locale', source)
        self.assertIn('.onChange(of: candidate) { _, _ in clear() }', source)
        self.assertIn('.onChange(of: scope) { _, _ in clear() }', source)
        self.assertIn('.onChange(of: chinese)', source)
        self.assertIn('store.visible(target), review == nil', source)
        self.assertIn('.disabled(availability != .ready)', source)
        self.assertIn('dayId = nil; windowConfirmed = false; refresh = UUID()', source)
        fixture = source.split('private struct NativePlaceActionsSample: View {')[1]
        for forbidden in ['NativeSession', 'placeActionRequest', 'prepareExploreAsk', 'URLSession', 'UserDefaults', 'Keychain']:
            self.assertNotIn(forbidden, fixture)
        self.assertIn('Sample · Unconnected', fixture)
        self.assertIn('Cancel sample diff', fixture)
        self.assertIn('Stop unsubmitted sample operation', fixture)
        self.assertIn('Reset sample', fixture)
        self.assertIn('.accessibility3', fixture)

if __name__ == '__main__':
    unittest.main()
