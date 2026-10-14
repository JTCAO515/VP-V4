"""Cross-page fixture identity and leaf isolation checks; never opens services."""
import pathlib
import subprocess
import tempfile
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[3]
STATE = ROOT / 'ios/VisePanda/VisePanda/Features/Frontend/NativeFrontendState.swift'
JOURNEYS = ROOT / 'ios/VisePanda/VisePanda/Features/Frontend/Journeys/NativeFrontendJourneysView.swift'

class JourneysTests(unittest.TestCase):
    def test_shared_state_cross_page_ids(self):
        # Execute Main's actual state, retaining its Observation model and methods.
        state = STATE.read_text().split('struct NativeFrontendBoundary: View')[0].replace('import SwiftUI', 'import Foundation')
        probe = '''
@main struct Probe {
    @MainActor static func main() {
        let state = NativeFrontendState()
        let id = state.journeys[0].id
        state.openJourney(id)
        precondition(state.selectedJourneyID == id && state.selectedTab == .journeys)
        state.openJourney("not-a-journey")
        precondition(state.selectedJourneyID == id)
        state.openChat(context: id)
        precondition(state.chatContext == id && state.selectedTab == .vp)
        state.openMaterial("sample-plan")
        precondition(state.selectedMaterialID == "sample-plan" && state.selectedTab == .library)
        precondition(state.materials.first { $0.id == "sample-plan" }?.journeyID == id)
        state.screenState = .loading
        precondition(state.journeys[0].id == id && state.chatContext == id)
        state.screenState = .cancelled
        precondition(state.journeys[0].id == id)
        state.selectedJourneyID = nil
        state.openJourney(id)
        precondition(state.selectedJourneyID == id)
        state.reset()
        precondition(state.selectedJourneyID == nil && state.selectedMaterialID == nil && state.chatContext == nil)
        print("PASS: actual shared state journey/chat/material IDs and cancellation/reset")
    }
}
'''
        with tempfile.TemporaryDirectory(prefix='ios003-journey-state-') as temp:
            path = pathlib.Path(temp)
            (path / 'State.swift').write_text('enum AppTab { case vp, journeys, library, memory }\n' + state)
            (path / 'Probe.swift').write_text(probe)
            subprocess.run(['xcrun','swiftc','-parse-as-library','-swift-version','6',str(path/'State.swift'),str(path/'Probe.swift'),'-o',str(path/'probe')],check=True)
            subprocess.run([str(path/'probe')],check=True)

    def test_leaf_navigation_and_missing_object_fences(self):
        source = JOURNEYS.read_text()
        self.assertIn('let state: NativeFrontendState', source)
        self.assertIn('state.journeys.first { $0.id == journeyID }', source)
        self.assertIn('journey.days.indices.contains(dayIndex)', source)
        self.assertIn('lastOpenedJourneyID != id', source)
        self.assertIn('if !visible { lastOpenedJourneyID = nil; state.selectedJourneyID = nil }', source)
        self.assertIn('state.openChat(context: journeyID)', source)
        self.assertIn('state.openMaterial("sample-plan")', source)
        self.assertIn('NativePlaceActionsSampleExperience()', source)
        self.assertIn('NativeFrontendBoundary()', source)
        self.assertIn('NativeFrontendStatePanel(state: state)', source)
        self.assertIn('journeyID + ":" + String(dayIndex) + ":" + key', source)
        for forbidden in ['NavigationStack {', 'TabView {', 'NativeFrontendState()', 'NativeSession', 'NativeJourneysStore', 'URLSession', 'UserDefaults', 'state.confirmPlan()', 'state.journeys[0]']:
            self.assertNotIn(forbidden, source)
        for claim in ['不是实际地图', '当前没有真实预订', '距离、价格：未知', '不会借用别的旅程安排', '仅记录本页样例阅读']:
            self.assertIn(claim, source)

if __name__ == '__main__':
    unittest.main()
