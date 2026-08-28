# AI-32 unrun checks

- Live Qwen3.5 LiveTranslate, ASR, MT, TTS, WebRTC, AOQ credential, region/DPA, and device tests were not run. This Issue intentionally introduces no provider adapter, account credential, browser transport, or production route; those checks require a separately accepted integration/release Issue and authorized external account use.
- The existing local-Supabase RLS integration test in `pnpm test:security` was skipped because local Supabase was not running. It is unrelated to the fixture-only realtime module.
- No browser QA applies: AI-32 owns no UI route or component.
