# AI-33 unrun checks

- No physical-device microphone, Bluetooth, background, or real TTS test ran. The interface has no hardware or audio implementation and a disabled hold-to-talk control.
- No ASR, translation, WebRTC, server authorization, short-lived credential issuance, provider, region/DPA, or LiveTranslate integration ran. AI-33 owns only the frontend fallback; the current REALTIME-00 contract is fixture-only and fail-closed.
- No real TTS-to-screen equality recording exists because this Issue intentionally renders no translation or audio.
- The browser's `/favicon.ico` 404 is a pre-existing global asset gap and remains out of scope.
