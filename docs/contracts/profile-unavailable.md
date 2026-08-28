# User Profile contract

V4-16 owns the owner-scoped `GET`/`POST /api/profile` route and the Profile
workspace. `GET` returns the persisted explicit Profile or `null` when none has
been saved; the neutral form is not a claimed account value. `POST` accepts only
the closed Profile payload and saves it through the owner-JWT
`save_user_profile` RPC, then the client reloads the server state.

The Profile stores display name, travel pace, UI locale (`zh`, `en`, `es`, `ru`,
`ar`), currency, distance unit, temperature unit and default departure time.
It never reads, infers, writes or presents Memory as Profile data. Anonymous
access and direct authenticated table writes are blocked by RLS; mutation also
requires a same-origin request. Responses are `private, no-store` and no
browser-local persistence or service credential is used.
