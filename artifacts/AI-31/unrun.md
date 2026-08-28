# AI-31 unrun checks

- No image, OCR request, MT request, DeepSeek Vision request, Qwen request, provider confidence,
  user correction persistence, TTS synthesis, audio, storage, account, credential, or deployment was used.
- The closed `c0_synthetic` fixture marker is mandatory. It does not authorize user or production
  media, and it does not create a POI, Fact, Trip, provider result, durable revision, or TTS asset.
- OCR CER and field-exact evidence is fixture-only: 25 synthetic locale/type cases and three focused
  contract cases; it does not measure provider quality or establish a production error rate.

Rollback is a Git revert. No raw media, source text from a user, model output, durable revision, or
external state exists to delete.
