# AI-32 credential expiry proof

The only credential-related fixture is the exact input `{ "fixtureId": "expired-credential" }`.
It deterministically returns `credential_expired` with:

- authority: `server_authorized_only`
- reconnect: `new_server_authorization_required`

The fixture has no credential value. Browser-visible protocol results state
`browserCredential: never_issued`; malformed input and any supplied credential-like field return
`realtime_unavailable` without echoing the supplied value. A source-level RL-07 test also rejects
transport/environment primitives in this module.
