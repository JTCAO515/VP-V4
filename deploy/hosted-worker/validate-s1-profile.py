"""Fail closed before a nonsecret S1 profile can enter Docker Config.Env."""
import json
import re
import sys


def closed_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def exact_int(value, expected):
    return type(value) is int and value == expected


def valid(profile):
    if not isinstance(profile, dict) or set(profile) != {
        "schemaVersion", "pollIntervalMs", "maxLifetimeMs", "drainMs",
        "concurrency", "groupLimit", "modes", "qwen",
    }:
        return False
    if profile["schemaVersion"] != "vpj07-hosted-text-worker/1" or profile["modes"] != ["current_input_v1"]:
        return False
    for name, expected in {
        "pollIntervalMs": 3000, "maxLifetimeMs": 86400000, "drainMs": 45000,
        "concurrency": 1, "groupLimit": 1,
    }.items():
        if not exact_int(profile[name], expected):
            return False
    tariff = profile["qwen"]
    if not isinstance(tariff, dict) or set(tariff) != {
        "priceVersion", "pricing", "reservedMicros", "maxOutputTokens",
        "timeoutMs", "configurationId", "configurationVersion",
    }:
        return False
    if tariff["priceVersion"] != "qwen-public-upper-20260912-v1":
        return False
    for name, expected in {
        "reservedMicros": 7000000, "maxOutputTokens": 1024,
        "timeoutMs": 60000, "configurationVersion": 1,
    }.items():
        if not exact_int(tariff[name], expected):
            return False
    if not isinstance(tariff["configurationId"], str) or not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        tariff["configurationId"], re.I,
    ):
        return False
    return tariff["pricing"] == {
        "mode": "flat", "inputMicrosPerMillion": 6000000,
        "outputMicrosPerMillion": 24000000, "cachedInputMicrosPerMillion": None,
    } and all(
        type(tariff["pricing"][name]) is int
        for name in ("inputMicrosPerMillion", "outputMicrosPerMillion")
    )


try:
    if len(sys.argv) != 2:
        raise ValueError("path required")
    with open(sys.argv[1], encoding="utf-8") as source:
        profile = json.load(source, object_pairs_hook=closed_pairs)
    if not valid(profile):
        raise ValueError("invalid profile")
except (OSError, UnicodeError, ValueError, TypeError, KeyError):
    print("S1 profile unavailable.", file=sys.stderr)
    sys.exit(1)
