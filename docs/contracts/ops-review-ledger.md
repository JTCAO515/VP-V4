# Ops review ledger contract

AI-25 is a C0 private review ledger, not an Ops deployment or UI.

`submit` accepts an exact timestamp, author ID, and Draft ID. `review` accepts an exact timestamp, reviewer ID, Draft ID, and the closed audit mode. A reviewer equal to the author fails closed. Only `audit: "record"` may publish; every other audit result is a failed transaction, so it writes neither a Fact nor an audit event.

The successful result holds only a private Fact ID/Draft ID and reviewer audit metadata. It has no secret, raw payload, public projection, Canonical ID, route, model, external action, or durable storage. A repeated review cannot produce another Fact.

Separate deployment, credentials, authentication, RLS, source identity/rebase/expiry operations, durable audit, public-web isolation, and browser UI require accepted runtime work and are explicitly unrun here.
