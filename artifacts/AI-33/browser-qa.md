# AI-33 browser QA

Local browser verification used `http://localhost:3133/translate` with the production source in this worktree.

- At 390×844, the three panels stack in reading order; manual text accepts input, copy reports completion, and clear returns the input to empty.
- The Arabic locale changes the document direction to `rtl` (observed via `document.documentElement.dir`) and renders Arabic labels, stages, manual controls, unavailable voice status, and TTS boundary.
- At 1280×800, the manual panel and the two state panels render as the intended two-column composition.
- No microphone permission, transport, Provider request, translation, or TTS action was invoked. The disabled press-and-hold control is visible and has no event handler.

The browser reported one pre-existing `/favicon.ico` 404. It does not originate in the AI-33 route and is outside this Issue's allowed paths.
