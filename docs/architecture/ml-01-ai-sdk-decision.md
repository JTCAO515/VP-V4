# ML-01 AI SDK adoption decision

**Decision:** reject adoption for the current baseline; retain thin HTTP adapters.

The five required conditions are DeepSeek/Qwen text, vision, strict tool output, abort/usage, and
content-free telemetry. No current repository evidence proves all five against a real
OpenAI-compatible provider, and no provider account, key, external call, package installation,
bundle measurement or latency measurement was performed. The local gate therefore always returns
`reject/thin_http`: caller-supplied booleans are claims, not independent provider evidence.

| Required condition | C0 result | Evidence state |
| --- | --- | --- |
| DeepSeek/Qwen text | Not proven | no provider call or fixture conformance record |
| Vision | Not proven | no provider call or fixture conformance record |
| Strict tool output | Not proven | no provider call or fixture conformance record |
| Abort and usage | Not proven | no provider call or fixture conformance record |
| `recordInputs:false` and `recordOutputs:false` telemetry | Not proven | no SDK telemetry is configured |
| Bundle delta | Unrun | no SDK package installation or build comparison |
| Latency delta | Unrun | no provider target or repeatable measurement |

Telemetry acceptance requires explicit `recordInputs:false` and `recordOutputs:false` in a future
real SDK spike; no SDK telemetry is enabled here. Domain contracts remain library-independent.

Rollback is inherent: keep the existing thin HTTP adapter path. Reopen this decision only with
approved provider/region/retention evidence and repeatable conformance, telemetry, bundle and
latency measurements.
