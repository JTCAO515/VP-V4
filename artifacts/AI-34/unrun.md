# AI-34 unrun checks

- Physical-device recordings across zh/en/es/ru/ar, including noise, low light, rotation, named entities, numbers, camera/microphone/Bluetooth/background and permission-denial behavior, were not run. The repository has no real media/voice provider path to exercise.
- Provider region/DPA, C3 retention, object/provider deletion, AOQ credential issuance, WebRTC, ASR, MT, TTS, latency, cost and human adequacy evaluation were not run; no authorized account, credential or production deployment was used.
- Local Supabase runtime/RLS tests remain skipped where the existing suites require a running local Supabase instance.
