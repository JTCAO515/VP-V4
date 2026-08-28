# AI-33 TTS equals screen proof

The UI produces neither a translated string nor audio. The only TTS state shown is the localized
unavailable state. Its copy states the frozen invariant: future audio may only match the exact text
shown on screen. The e2e source acceptance checks that the UI keeps `No translated text or audio is
available` and contains no microphone, WebSocket, fetch, or audio-context implementation.

Observed fixture count: 1 UI state in each of five locales; 0 generated translations; 0 TTS outputs.
Runtime invariant: without an approved displayed translation, no audio control or audio output exists.
