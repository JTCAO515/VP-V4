"""Fail closed before a nonsecret explicit-target QA-only v4 profile enters Docker Config.Env."""
import json
import re
import sys


def closed_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate key")
        value[key] = item
    return value


def integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def valid(profile):
    if not isinstance(profile, dict) or set(profile) != {
        "schemaVersion", "projectRef", "pollIntervalMs", "maxLifetimeMs", "drainMs",
        "concurrency", "groupLimit", "modes", "qwen", "planning",
    }:
        return False
    if (profile["schemaVersion"] != "vpj07-hosted-text-worker/4"
            or not isinstance(profile["projectRef"], str)
            or re.fullmatch(r"[a-z0-9]{20}", profile["projectRef"]) is None
            or profile["projectRef"] != "dzqdzetcctkhbrhlxxgn"
            or profile["modes"] != ["qa_session_history_v1"]
            or profile["planning"] is not None):
        return False
    for name, lo, hi in (
        ("pollIntervalMs", 1000, 60000), ("maxLifetimeMs", 60000, 86400000),
        ("drainMs", 0, 60000), ("concurrency", 1, 8), ("groupLimit", 1, 50),
    ):
        if not integer(profile[name], lo, hi):
            return False
    tariff = profile["qwen"]
    if not isinstance(tariff, dict) or set(tariff) != {
        "priceVersion", "pricing", "reservedMicros", "maxOutputTokens",
        "timeoutMs", "configurationId", "configurationVersion",
    }:
        return False
    version = tariff["priceVersion"]
    if (not isinstance(version, str)
            or re.fullmatch(r"[A-Za-z0-9._-]{1,100}", version) is None
            or version.lower().startswith(("sb_secret_", "sk-", "token_", "password_"))):
        return False
    if not (integer(tariff["reservedMicros"], 1, 1_000_000_000_000)
            and integer(tariff["maxOutputTokens"], 1, 4096)
            and integer(tariff["timeoutMs"], 1, 60000)
            and integer(tariff["configurationVersion"], 1, 9007199254740991)
            and isinstance(tariff["configurationId"], str)
            and re.fullmatch(
                r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
                tariff["configurationId"], re.I,
            ) is not None):
        return False
    price = tariff["pricing"]
    if not isinstance(price, dict) or set(price) != {
        "mode", "inputMicrosPerMillion", "outputMicrosPerMillion", "cachedInputMicrosPerMillion",
    }:
        return False
    if not (integer(price["inputMicrosPerMillion"], 1, 1_000_000_000_000)
            and integer(price["outputMicrosPerMillion"], 1, 1_000_000_000_000)):
        return False
    cached = price["cachedInputMicrosPerMillion"]
    if price["mode"] == "flat":
        if cached is not None:
            return False
    elif price["mode"] == "cache_split":
        if not integer(cached, 1, 1_000_000_000_000):
            return False
    else:
        return False
    highest_input = max(price["inputMicrosPerMillion"], cached or 0)
    required = (1048576 * highest_input
                + tariff["maxOutputTokens"] * price["outputMicrosPerMillion"]
                + 999999) // 1000000
    return required <= 1_000_000_000_000 and tariff["reservedMicros"] >= required


try:
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] != "--emit"):
        raise ValueError("path required")
    with open(sys.argv[1], encoding="utf-8") as source:
        profile = json.load(source, object_pairs_hook=closed_pairs)
    if not valid(profile):
        raise ValueError("invalid profile")
    if len(sys.argv) == 3:
        print(json.dumps(profile, separators=(",", ":")))
except (OSError, UnicodeError, ValueError, TypeError, KeyError):
    print("QA profile unavailable.", file=sys.stderr)
    sys.exit(1)
