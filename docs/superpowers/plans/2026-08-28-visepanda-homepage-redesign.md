# VisePanda immersive Homepage redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/` with an immersive VisePanda entry, relocate the existing landing page to `/homepage`, and retain safe real internal navigation.

**Architecture:** `app/page.tsx` stays server-rendered and renders a dedicated static component. `app/homepage/page.tsx` renders the existing client `Homepage` unchanged. The new component uses an original CSS Great-Wall-and-mountain composition because all repository travel photographs are blocked-release, plus existing copy and CSS Modules; it adds no client upload, provider, map or persistence behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, local VisePanda assets, Node test runner.

## Global Constraints

- Keep `app/page.tsx` a Server Component and use only approved project-local VisePanda assets.
- `/visepanda` remains the real `Open VisePanda` destination; `/homepage` is a separate guide/legacy landing route.
- Keep map disabled; do not add AI, booking, persistence, upload, provider or current-data claims.
- Preserve five locales and Arabic `lang="ar" dir="rtl"` through `lib/i18n.ts`.
- The supplied Wandor name, external video, Google fonts and Vite assumptions are not runtime dependencies.

---

### Task 1: Establish route and navigation red tests

**Files:**
- Create: `tests/e2e/homepage/immersive-homepage.test.mjs`
- Modify: `tests/static-output.test.mjs`

**Interfaces:**
- Consumes: `app/page.tsx`, `components/homepage/Homepage.tsx`.
- Produces: route assertions for `ImmersiveHomepage`, `/homepage`, `/visepanda`, local asset use and map-off source.

- [x] **Step 1: Write the failing test**

```js
const root = readFileSync("app/page.tsx", "utf8");
const relocated = readFileSync("app/homepage/page.tsx", "utf8");
const hero = readFileSync("components/homepage/ImmersiveHomepage.tsx", "utf8");
assert.match(root, /ImmersiveHomepage/);
assert.match(relocated, /<Homepage\s*\/>/);
assert.match(hero, /href="\/visepanda"/);
assert.match(hero, /href="\/homepage"/);
assert.match(hero, /styles\.landscape/);
assert.doesNotMatch(hero, /hero-beijing\.jpg/);
assert.doesNotMatch(hero, /https?:\/\//);
assert.doesNotMatch(hero, /Map/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/homepage/immersive-homepage.test.mjs`

Expected: fail because the route and component do not exist.

- [x] **Step 3: Complete the red-test task in the implementation commit**

```bash
git add tests/e2e/homepage/immersive-homepage.test.mjs tests/static-output.test.mjs
git commit -m "test: define immersive homepage route contract"
```

### Task 2: Implement the static immersive VisePanda entry

**Files:**
- Create: `components/homepage/ImmersiveHomepage.tsx`
- Create: `components/homepage/ImmersiveHomepage.module.css`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `immersiveHomepageCopy` and existing global token variables.
- Produces: `export function ImmersiveHomepage()` with anchors to `/visepanda` and `/homepage`.

- [x] **Step 1: Write the minimal server component after red tests**

```tsx
import { copy } from "@/lib/i18n";
import styles from "./ImmersiveHomepage.module.css";

export function ImmersiveHomepage() {
  const content = copy.zh;
  return <main className={styles.page}>{content.hero.title}</main>;
}
```

Use a semantic CSS landscape with Great-Wall/mountain/sunrise elements and a localized aria label. The planning panel can show a decorative attachment symbol only: it cannot contain an `input type="file"` or a file-picker handler.

- [x] **Step 2: Add exact route actions and root wiring**

```tsx
<a className={styles.primaryAction} href="/visepanda">Open VisePanda</a>
<a className={styles.guideAction} href="/homepage">Explore the guide</a>
```

```tsx
import { ImmersiveHomepage } from "@/components/homepage/ImmersiveHomepage";
export default function HomePage() { return <ImmersiveHomepage />; }
```

The first link is visually primary. Both links have at least 44 px interactive height and visible keyboard focus.

- [x] **Step 3: Run the focused test to verify it passes**

Run: `node --test tests/e2e/homepage/immersive-homepage.test.mjs`

Expected: pass.

- [x] **Step 4: Commit component and root route with the relocation task**

```bash
git add app/page.tsx components/homepage/ImmersiveHomepage.tsx components/homepage/ImmersiveHomepage.module.css
git commit -m "feat: add immersive VisePanda homepage"
```

### Task 3: Relocate the landing route and apply responsive styling

**Files:**
- Create: `app/homepage/page.tsx`
- Modify: `components/homepage/ImmersiveHomepage.module.css`

**Interfaces:**
- Consumes: existing `Homepage` client component unchanged.
- Produces: `/homepage` legacy route and desktop/mobile/RTL-safe CSS.

- [x] **Step 1: Add the relocation route**

```tsx
import { Homepage } from "@/components/homepage/Homepage";
export default function RelocatedHomepage() { return <Homepage />; }
```

- [x] **Step 2: Add the responsive visual contract**

Implement `.page` as `min-height: 100svh` image canvas, an absolute local image layer, a white-to-transparent top gradient and a bounded `backdrop-filter` prompt panel. Use VisePanda cream, ink, plum and gold tokens. At `max-width: 760px`, hide centre links, keep both route actions, make the panel viewport-safe and remove horizontal overflow. In RTL use logical inline properties and do not mirror the landmark image.

- [x] **Step 3: Run source contracts**

Run: `node --test tests/e2e/homepage/immersive-homepage.test.mjs tests/static-output.test.mjs`

Expected: pass and preserve the root Magic Link retirement assertion.

- [x] **Step 4: Commit relocation and styling with the implementation**

```bash
git add app/homepage/page.tsx components/homepage/ImmersiveHomepage.module.css
git commit -m "feat: move legacy landing page to homepage route"
```

### Task 4: Validate, review, document and merge

**Files:**
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`
- Create: `artifacts/FRONTEND-HOMEPAGE/commands.jsonl`, `artifacts/FRONTEND-HOMEPAGE/unrun.md`

**Interfaces:**
- Consumes: all route tests and repository scripts.
- Produces: reproducible verification and explicit browser/deployment gaps.

- [x] **Step 1: Run deterministic checks**

Run: `pnpm check`, `pnpm test:e2e`, `pnpm docs:check`, `node -e "JSON.parse(require('node:fs').readFileSync('docs/handoff.json','utf8'))"`, `git diff --check`.

Expected: each exits 0; record each exact command/result in JSONL.

- [x] **Step 2: Inspect actual desktop, 390×844 and Arabic RTL output**

Verify the original CSS landscape renders, both anchors resolve internally, mobile does not horizontally overflow, centre navigation collapses, and logical RTL alignment remains readable. Do not claim screenshots, browser QA or deployment if not actually captured.

- [x] **Step 3: Independently review and repair**

Check exact routes, asset provenance, CTA priority, map-off, capability claims, keyboard focus and breakpoints. Fix every Critical/Important finding, rerun focused/full affected checks, and record the result.

- [x] **Step 4: Commit evidence and merge after a clear review**

```bash
git add docs/handoff.json HANDOFF.md CONTEXT.md artifacts/FRONTEND-HOMEPAGE
git commit -m "docs: record immersive homepage verification"
git -C C:/Users/jtcao/OneDrive/文档/ChatGPT/VP-v4-vercel-lockfile merge --ff-only codex/frontend-homepage-redesign
git -C C:/Users/jtcao/OneDrive/文档/ChatGPT/VP-v4-vercel-lockfile push origin main
```

## Plan self-review

- Spec coverage: Tasks 1–3 cover relocation, exact CTA URLs, local China landmark image, visual adaptation, static/no-upload boundary, map-off, responsive behavior and RTL. Task 4 covers verification, review, handoff and merge.
- Placeholder scan: no incomplete action or unspecified test remains; all interfaces and commands are named.
- Type consistency: `ImmersiveHomepage` is exported by `components/homepage/ImmersiveHomepage.tsx`, imported by `app/page.tsx`, and `/homepage` imports the existing `Homepage` export.
