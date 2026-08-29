# End-to-end suite

`pnpm test:e2e` runs source-inspection static contract tests. It verifies declared route and
capability boundaries, but it does not start a browser or prove an authenticated product journey.

`pnpm test:e2e:frontend` is the browser E2E lane. It builds the application and runs the Playwright
frontend acceptance suite in Chromium. A browser failure, missing browser dependency, or skipped
runtime prerequisite is reported as browser evidence, not as a passing static contract.

AI-07a established the command boundary; owning Chat, Canvas, Explore, and translation Issues add
their own browser and device coverage. A release acceptance claim requires the specified live
Staging evidence in addition to these repository lanes.
