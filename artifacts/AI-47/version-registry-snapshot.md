# AI-47 C0 version registry snapshot

Synthetic fixture attempt metadata contains only these stable pairs:

| Element | Version | Digest shape |
| --- | --- | --- |
| Prompt | `prompt-v1` | 64-character lowercase SHA-256 digest |
| Schema | `schema-v1` | 64-character lowercase SHA-256 digest |
| Route policy | `route-v1` | 64-character lowercase SHA-256 digest |
| Safe phrase | `safe-v1` | 64-character lowercase SHA-256 digest |

The variable boundary accepts version descriptors for Trip, evidence and message only; external
text is the fixed label `untrusted`. No prompt, response, reasoning, media or message content is
represented in this snapshot.
